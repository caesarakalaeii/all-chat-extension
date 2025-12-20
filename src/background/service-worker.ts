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
  DEFAULT_SETTINGS,
} from '../lib/storage';

// WebSocket connection
let wsConnection: WebSocket | null = null;
let wsOverlayId: string | null = null;
let wsReconnectAttempts = 0;
const WS_MAX_RECONNECT_ATTEMPTS = 10;
const WS_RECONNECT_DELAY_MS = 1000; // Base delay, will be multiplied by attempt number
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Connection states
type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'failed';
let currentConnectionState: ConnectionState = 'disconnected';

/**
 * Extension installation handler
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[AllChat] Extension installed');
    // Initialize default settings
    setSyncStorage(DEFAULT_SETTINGS);
  } else if (details.reason === 'update') {
    console.log('[AllChat] Extension updated to', chrome.runtime.getManifest().version);
    // Always update API URL on updates to ensure it's correct
    setSyncStorage({ apiGatewayUrl: DEFAULT_SETTINGS.apiGatewayUrl });
  }
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
          await connectWebSocket(message.overlayId);
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

  const response = await fetch(`${apiUrl}/api/v1/auth/streamers/${encodeURIComponent(username)}`, {
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
 * Connect to WebSocket for real-time messages
 */
async function connectWebSocket(overlayId: string): Promise<void> {
  // If already connected to this overlay, do nothing
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN && wsOverlayId === overlayId) {
    console.log('[AllChat] Already connected to overlay:', overlayId);
    return;
  }

  // Disconnect from previous overlay if any
  if (wsConnection) {
    wsConnection.close();
  }

  const apiUrl = await getApiGatewayUrl();
  const wsUrl = apiUrl.replace(/^http/, 'ws');
  const url = `${wsUrl}/ws/overlay/${overlayId}`;

  console.log('[AllChat] Connecting to WebSocket:', url);

  // Broadcast connecting state
  const state = wsReconnectAttempts > 0 ? 'reconnecting' : 'connecting';
  broadcastConnectionState(state);

  wsConnection = new WebSocket(url);
  wsOverlayId = overlayId;

  wsConnection.onopen = () => {
    console.log('[AllChat] WebSocket connected');
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
    chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
    chrome.action.setBadgeText({ text: '✗' });
  };

  wsConnection.onclose = () => {
    console.log('[AllChat] WebSocket closed');
    stopWebSocketHeartbeat();
    chrome.action.setBadgeBackgroundColor({ color: '#888888' });
    chrome.action.setBadgeText({ text: '' });

    // Clear any pending reconnect timeout
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
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
        if (wsOverlayId) {
          connectWebSocket(wsOverlayId);
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
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
    wsOverlayId = null;
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
 * Start WebSocket heartbeat (ping every 30 seconds)
 */
function startWebSocketHeartbeat(): void {
  heartbeatInterval = setInterval(() => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(
        JSON.stringify({
          type: 'ping',
          timestamp: new Date().toISOString(),
        })
      );
    }
  }, 30000);
}

/**
 * Stop WebSocket heartbeat
 */
function stopWebSocketHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Broadcast connection state to all tabs
 */
function broadcastConnectionState(state: ConnectionState, details?: any): void {
  currentConnectionState = state;

  chrome.tabs.query({}, (tabs) => {
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
        }).catch(() => {
          // Tab may not have content script, ignore error
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
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'WS_MESSAGE',
          data: message,
        }).catch(() => {
          // Tab may not have content script, ignore error
        });
      }
    });
  });
}

/**
 * Initiate OAuth flow
 */
async function initiateAuth(platform: string, streamerUsername?: string): Promise<string> {
  const apiUrl = await getApiGatewayUrl();

  let endpoint: string;
  if (platform === 'twitch') {
    endpoint = '/api/v1/auth/viewer/twitch/login';
  } else if (platform === 'youtube') {
    endpoint = '/api/v1/auth/viewer/youtube/login';
  } else {
    throw new Error('Unsupported platform');
  }

  const url = new URL(`${apiUrl}${endpoint}`);
  if (streamerUsername) {
    url.searchParams.set('streamer', streamerUsername);
  }

  const response = await fetch(url.toString());
  const data = await response.json();

  return data.auth_url;
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
