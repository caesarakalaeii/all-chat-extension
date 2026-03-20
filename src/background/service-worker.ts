/**
 * Service Worker (Background Script)
 *
 * Handles:
 * - API proxy for content scripts (bypass CORS)
 * - WebSocket connection management
 * - Token storage and validation
 * - Message relay to content scripts
 */

import {
  ExtensionMessage,
  ExtensionResponse,
  StreamerInfo,
  ViewerInfo,
} from '../lib/types/extension';
import {
  getApiGatewayUrl,
  getViewerToken,
  getSyncStorage,
  setLocalStorage,
  setSyncStorage,
  clearViewerAuth,
  setNameGradient,
  DEFAULT_SETTINGS,
} from '../lib/storage';

// Extension OAuth redirect URI — computed lazily to avoid crashing at module load
// if the identity permission is missing
function getExtensionRedirectURI(): string {
  return chrome.identity.getRedirectURL('oauth');
}

// WebSocket connection
let wsConnection: WebSocket | null = null;
let wsStreamerUsername: string | null = null;
let wsReconnectAttempts = 0;
const WS_MAX_RECONNECT_ATTEMPTS = 10;
const WS_RECONNECT_DELAY_MS = 1000; // Base delay, will be multiplied by attempt number
let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;


// Alarm name used to wake the service worker periodically so it can detect
// and recover from WebSocket drops caused by MV3 service worker termination.
// chrome.alarms is the only reliable keepalive mechanism in MV3 (setInterval
// does not prevent the worker from being evicted).
const KEEPALIVE_ALARM = 'allchat-ws-keepalive';

// chrome.storage.session key for persisting the active streamer across
// service worker restarts. Session storage is cleared when the browser closes.
const SESSION_STREAMER_KEY = 'ws_active_streamer';

// Restore WebSocket connection if the service worker was restarted while a
// session was active (e.g. due to MV3 30-second idle eviction).
(async () => {
  const result = await chrome.storage.session.get(SESSION_STREAMER_KEY);
  const savedStreamer = result[SESSION_STREAMER_KEY] as string | undefined;
  if (savedStreamer) {
    console.log('[AllChat] Service worker restarted — restoring connection for:', savedStreamer);
    connectWebSocket(savedStreamer);
  }
})();

// Wake up every ~1 minute and reconnect if the WebSocket dropped while the
// worker was suspended.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  const result = await chrome.storage.session.get(SESSION_STREAMER_KEY);
  const savedStreamer = result[SESSION_STREAMER_KEY] as string | undefined;
  if (savedStreamer && (!wsConnection || wsConnection.readyState !== WebSocket.OPEN)) {
    console.log('[AllChat] Keepalive alarm: reconnecting WebSocket for:', savedStreamer);
    wsStreamerUsername = null; // Force connectWebSocket to open a new connection
    connectWebSocket(savedStreamer);
  }
});

// Connection states
type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'failed';
let currentConnectionState: ConnectionState = 'disconnected';

/**
 * Extension installation handler
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[AllChat] Extension installed');
    setSyncStorage(DEFAULT_SETTINGS);
  } else if (details.reason === 'update') {
    console.log('[AllChat] Extension updated to', chrome.runtime.getManifest().version);
    setSyncStorage({ apiGatewayUrl: DEFAULT_SETTINGS.apiGatewayUrl });
  }
  // Always reset API URL on install/update to clear stale localhost values
  setSyncStorage({ apiGatewayUrl: DEFAULT_SETTINGS.apiGatewayUrl });
});

/**
 * Message handler - listens for messages from content scripts
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_STREAMER_INFO':
          const info = await fetchStreamerInfo(message.username);
          sendResponse({ success: true, data: info });
          break;

        case 'CONNECT_WEBSOCKET':
          await connectWebSocket(message.streamerUsername);
          sendResponse({ success: true });
          break;

        case 'DISCONNECT_WEBSOCKET':
          disconnectWebSocket();
          sendResponse({ success: true });
          break;

        case 'SEND_CHAT_MESSAGE':
          await sendChatMessage(message.streamerUsername, message.message);
          sendResponse({ success: true });
          break;

        case 'START_AUTH':
          const authUrl = await initiateAuth(message.platform, message.streamerUsername);
          sendResponse({ success: true, data: { authUrl } });
          break;

        case 'EXCHANGE_CODE':
          await exchangeCodeForToken(message.platform, message.code, message.state);
          sendResponse({ success: true });
          break;

        case 'DO_LOGIN': {
          const loginUrl = await initiateAuthUrl(message.platform, message.streamerUsername);
          sendResponse({ success: true, data: { loginUrl } });
          break;
        }

        case 'SAVE_NAME_COLOR':
          await saveNameColor(message.color);
          sendResponse({ success: true });
          break;

        case 'SAVE_NAME_GRADIENT': {
          const gradientMsg = message as { type: 'SAVE_NAME_GRADIENT'; gradient: string | null };
          await setNameGradient(gradientMsg.gradient);
          // Clear name_color when gradient is saved (mutual exclusion)
          if (gradientMsg.gradient !== null) {
            await setLocalStorage({ viewer_name_color: undefined });
          }
          sendResponse({ success: true });
          break;
        }

        case 'GET_AUTH_STATUS':
          const token = await getViewerToken();
          const viewerInfo = token ? await fetchViewerMe(token) : null;
          sendResponse({ success: true, data: { authenticated: !!token, viewerInfo } });
          break;

        case 'LOGOUT':
          await clearViewerAuth();
          sendResponse({ success: true });
          break;

        case 'STORE_VIEWER_TOKEN':
          await storeViewerToken(message.token);
          sendResponse({ success: true });
          break;

        case 'GET_CONNECTION_STATE':
          sendResponse({
            success: true,
            data: {
              state: currentConnectionState,
              attempts: wsReconnectAttempts,
              maxAttempts: WS_MAX_RECONNECT_ATTEMPTS
            }
          });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error: any) {
      console.error('[AllChat] Service worker error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

/**
 * Fetch streamer info from API
 */
async function fetchStreamerInfo(username: string): Promise<StreamerInfo> {
  const apiUrl = await getApiGatewayUrl();
  const fetchUrl = `${apiUrl}/api/v1/auth/streamers/${encodeURIComponent(username)}`;
  console.log('[AllChat SW] Fetching streamer info from:', fetchUrl);

  const response = await fetch(fetchUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) {
    throw new Error('STREAMER_NOT_FOUND');
  }

  if (!response.ok) {
    throw new Error('FETCH_FAILED');
  }

  return response.json();
}

/**
 * Connect to viewer WebSocket for real-time messages
 * Uses /ws/chat/{streamer} endpoint which does NOT trigger YouTube polling
 * and does not expose the secret overlay ID
 */
async function connectWebSocket(streamerUsername: string): Promise<void> {
  // If already connected to this streamer, do nothing
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN && wsStreamerUsername === streamerUsername) {
    console.log('[AllChat] Already connected to streamer:', streamerUsername);
    return;
  }

  // Disconnect from previous connection if any
  if (wsConnection) {
    wsConnection.close();
  }

  // Persist active streamer so a restarted service worker can reconnect.
  await chrome.storage.session.set({ [SESSION_STREAMER_KEY]: streamerUsername });
  // Ensure the keepalive alarm is running.
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.9 });

  const apiUrl = await getApiGatewayUrl();
  const wsUrl = apiUrl.replace(/^http/, 'ws');

  // Use viewer-specific endpoint (does NOT trigger polling or expose overlay ID)
  const token = await getViewerToken();
  const tokenParam = token ? `?token=${token}` : '';
  const url = `${wsUrl}/ws/chat/${streamerUsername}${tokenParam}`;

  console.log('[AllChat] Connecting to viewer WebSocket:', url);

  // Broadcast connecting state
  const state = wsReconnectAttempts > 0 ? 'reconnecting' : 'connecting';
  broadcastConnectionState(state);

  wsConnection = new WebSocket(url);
  wsStreamerUsername = streamerUsername;

  wsConnection.onopen = () => {
    console.log('[AllChat] WebSocket connected successfully!');
    wsReconnectAttempts = 0;
    startWebSocketHeartbeat();

    // Update extension badge
    chrome.action.setBadgeBackgroundColor({ color: '#00ff00' });
    chrome.action.setBadgeText({ text: '✓' });

    // Broadcast connected state
    broadcastConnectionState('connected');
  };

  wsConnection.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    } catch (error) {
      console.error('[AllChat] Failed to parse WebSocket message:', error);
    }
  };

  wsConnection.onerror = (error) => {
    console.error('[AllChat] WebSocket error:', error);
    console.error('[AllChat] WebSocket URL was:', url);
    console.error('[AllChat] WebSocket readyState:', wsConnection?.readyState);
    chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
    chrome.action.setBadgeText({ text: '✗' });
  };

  wsConnection.onclose = (event) => {
    console.log('[AllChat] WebSocket closed - Code:', event.code, 'Reason:', event.reason, 'Clean:', event.wasClean);
    stopWebSocketHeartbeat();
    chrome.action.setBadgeBackgroundColor({ color: '#888888' });
    chrome.action.setBadgeText({ text: '' });

    // Clear any pending reconnect timeout
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }

    // Check if this is likely a "not public for viewers" error
    // WebSocket closes immediately (code 1006) when streamer not found or not public
    const isNotPublicError = event.code === 1006 && wsReconnectAttempts === 0;

    if (isNotPublicError) {
      console.error('[AllChat] Overlay may not be public for viewers or streamer not found');
      chrome.action.setBadgeBackgroundColor({ color: '#ff9900' });
      chrome.action.setBadgeText({ text: '!' });

      // Broadcast failed state with specific error
      broadcastConnectionState('failed', {
        error: 'OVERLAY_NOT_PUBLIC',
        message: `${wsStreamerUsername} has not enabled "Public for Viewers" on their overlay. They need to enable this setting at allch.at`
      });
      return;
    }

    // Attempt reconnection
    if (wsReconnectAttempts < WS_MAX_RECONNECT_ATTEMPTS) {
      wsReconnectAttempts++;
      const delay = WS_RECONNECT_DELAY_MS * wsReconnectAttempts;
      console.log(`[AllChat] Reconnecting in ${delay}ms (attempt ${wsReconnectAttempts}/${WS_MAX_RECONNECT_ATTEMPTS})`);

      // Broadcast reconnecting state with countdown
      broadcastConnectionState('reconnecting', {
        reconnectIn: delay,
      });

      reconnectTimeoutId = setTimeout(() => {
        if (wsStreamerUsername) {
          connectWebSocket(wsStreamerUsername);
        }
      }, delay);
    } else {
      console.error('[AllChat] Max reconnection attempts reached');
      chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
      chrome.action.setBadgeText({ text: '✗' });

      // Broadcast failed state
      broadcastConnectionState('failed');
    }
  };
}

/**
 * Disconnect from WebSocket
 */
function disconnectWebSocket(): void {
  chrome.storage.session.remove(SESSION_STREAMER_KEY);
  chrome.alarms.clear(KEEPALIVE_ALARM);
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
    wsStreamerUsername = null;
  }
  stopWebSocketHeartbeat();

  // Clear reconnect timeout
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }

  // Reset state
  wsReconnectAttempts = 0;
  broadcastConnectionState('disconnected');
}

/**
 * Start WebSocket heartbeat.
 * The server sends WebSocket protocol-level pings every 30 s; the browser's
 * WebSocket implementation responds with pongs automatically, so no
 * application-level ping is needed here. The keepalive alarm handles
 * service-worker restart recovery instead of setInterval.
 */
function startWebSocketHeartbeat(): void {
  // Intentionally empty: server-side protocol pings keep the connection alive.
  // Recovery from service-worker eviction is handled by KEEPALIVE_ALARM.
}

/**
 * Stop WebSocket heartbeat.
 */
function stopWebSocketHeartbeat(): void {
  // No-op: alarm is cleared only on an explicit disconnectWebSocket() call
  // so it continues running across automatic service-worker restarts.
}

/**
 * Broadcast connection state to all tabs
 */
function broadcastConnectionState(state: ConnectionState, details?: any): void {
  currentConnectionState = state;

  console.log('[AllChat] Broadcasting connection state:', state);

  chrome.tabs.query({}, (tabs) => {
    console.log(`[AllChat] Found ${tabs.length} tabs to broadcast to`);
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CONNECTION_STATE',
          data: {
            state,
            attempts: wsReconnectAttempts,
            maxAttempts: WS_MAX_RECONNECT_ATTEMPTS,
            ...details,
          },
        }).then(() => {
          console.log(`[AllChat] Sent CONNECTION_STATE to tab ${tab.id}`);
        }).catch((err) => {
          console.log(`[AllChat] Failed to send to tab ${tab.id}:`, err.message);
        });
      }
    });
  });
}

/**
 * Handle WebSocket message and broadcast to content scripts
 */
function handleWebSocketMessage(message: any): void {
  console.log('[AllChat] WebSocket message:', message.type);

  // Broadcast to all active tabs
  chrome.tabs.query({}, (tabs) => {
    console.log(`[AllChat] Broadcasting WS_MESSAGE to ${tabs.length} tabs`);
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'WS_MESSAGE',
          data: message,
        }).then(() => {
          console.log(`[AllChat] Sent WS_MESSAGE to tab ${tab.id}`);
        }).catch((err) => {
          console.log(`[AllChat] Failed to send WS_MESSAGE to tab ${tab.id}:`, err.message);
        });
      }
    });
  });
}

/**
 * Initiate OAuth flow — returns auth_url with extension redirect_uri substituted
 */
async function initiateAuth(platform: string, streamerUsername?: string): Promise<string> {
  const apiUrl = await getApiGatewayUrl();

  const platformEndpoints: Record<string, string> = {
    twitch: '/api/v1/auth/viewer/twitch/login',
    youtube: '/api/v1/auth/viewer/youtube/login',
    kick: '/api/v1/auth/viewer/kick/login',
  };

  const endpoint = platformEndpoints[platform];
  if (!endpoint) throw new Error('Unsupported platform');

  const url = new URL(`${apiUrl}${endpoint}`);
  if (streamerUsername) {
    url.searchParams.set('streamer', streamerUsername);
  }

  const response = await fetch(url.toString());
  const data = await response.json();

  // Swap the backend redirect_uri for the extension redirect URI
  const authUrl = new URL(data.auth_url);
  authUrl.searchParams.set('redirect_uri', getExtensionRedirectURI());
  return authUrl.toString();
}

/**
 * Get the OAuth login URL for the given platform without modifying the redirect_uri.
 * The content script opens a popup to this URL and the allch.at callback posts the token back.
 */
async function initiateAuthUrl(platform: string, streamerUsername?: string): Promise<string> {
  const apiUrl = await getApiGatewayUrl();
  const platformEndpoints: Record<string, string> = {
    twitch: '/api/v1/auth/viewer/twitch/login',
    youtube: '/api/v1/auth/viewer/youtube/login',
    kick: '/api/v1/auth/viewer/kick/login',
  };
  const endpoint = platformEndpoints[platform];
  if (!endpoint) throw new Error('Unsupported platform');
  const url = new URL(`${apiUrl}${endpoint}`);
  if (streamerUsername) url.searchParams.set('streamer', streamerUsername);
  const response = await fetch(url.toString());
  const data = await response.json();
  return data.auth_url;
}

/**
 * Exchange OAuth code for viewer JWT via extension-mode endpoint
 */
async function exchangeCodeForToken(platform: string, code: string, state: string): Promise<void> {
  const apiUrl = await getApiGatewayUrl();
  const response = await fetch(`${apiUrl}/api/v1/auth/viewer/${platform}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state }),
  });

  if (!response.ok) {
    throw new Error(`Exchange failed: ${response.status}`);
  }

  const { token } = await response.json();
  await storeViewerToken(token);
}

/**
 * Save viewer name color locally and persist to backend
 */
async function saveNameColor(color: string | null): Promise<void> {
  if (color) {
    await setLocalStorage({ viewer_name_color: color });
  } else {
    await new Promise<void>((resolve) => chrome.storage.local.remove('viewer_name_color', resolve));
  }

  const token = await getViewerToken();
  if (!token) return;

  const apiUrl = await getApiGatewayUrl();
  await fetch(`${apiUrl}/api/v1/auth/viewer/cosmetics`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name_color: color }),
  });
}

/**
 * Store viewer token and fetch viewer info
 */
async function storeViewerToken(token: string): Promise<void> {
  await setLocalStorage({ viewer_jwt_token: token });

  try {
    const viewerInfo = await fetchViewerMe(token);
    await setLocalStorage({ viewer_info: viewerInfo });
  } catch (error) {
    console.error('[AllChat] Failed to fetch viewer info:', error);
  }
}

/**
 * Fetch viewer info
 */
async function fetchViewerMe(token: string): Promise<ViewerInfo> {
  const apiUrl = await getApiGatewayUrl();

  const response = await fetch(`${apiUrl}/api/v1/auth/viewer/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch viewer info');
  }

  return response.json();
}

/**
 * Send chat message
 */
async function sendChatMessage(streamerUsername: string, message: string): Promise<void> {
  const token = await ensureValidToken();
  if (!token) {
    throw new Error('NOT_AUTHENTICATED');
  }

  const apiUrl = await getApiGatewayUrl();

  const response = await fetch(`${apiUrl}/api/v1/auth/viewer/chat/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      streamer_username: streamerUsername,
      message,
    }),
  });

  if (response.status === 429) {
    const data = await response.json();
    throw { error: 'RATE_LIMITED', data: { reset_time: data.reset_time } };
  }

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'SEND_FAILED');
  }
}

/**
 * Ensure token is valid (not expired)
 */
async function ensureValidToken(): Promise<string | null> {
  const token = await getViewerToken();
  if (!token) return null;

  try {
    // Decode JWT to check expiration (without validation)
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = payload.exp * 1000; // Convert to milliseconds

    if (Date.now() >= expiresAt) {
      // Token expired, clear it
      console.log('[AllChat] Token expired, clearing');
      await clearViewerAuth();
      return null;
    }

    return token;
  } catch (error) {
    console.error('[AllChat] Failed to decode token:', error);
    await clearViewerAuth();
    return null;
  }
}

console.log('[AllChat] Service worker initialized');
