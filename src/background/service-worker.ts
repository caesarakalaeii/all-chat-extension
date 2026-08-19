/**
 * This file is part of All-Chat Extension.
 * Copyright (C) 2026 caesarakalaeii
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

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
import { POPOUT_PORT_NAME } from '../lib/types/popout';
import {
  getApiGatewayUrl,
  getViewerToken,
  getSyncStorage,
  setLocalStorage,
  setSyncStorage,
  clearViewerAuth,
  markIntentionalLogout,
  clearLogoutIntent,
  setNameGradient,
  DEFAULT_SETTINGS,
} from '../lib/storage';
import { computeBackoffDelay } from '../lib/backoff';
import {
  decideCloseAction,
  isApplicationCloseCode,
  type StreamerProbeResult,
} from '../lib/closeReason';
import {
  advancesWatermark,
  buildViewerSocketUrl,
  coerceWatermark,
  extractMessageTimestamp,
  lastSeenKey,
  nextWatermark,
} from '../lib/lastSeen';

// Registry of connected pop-out window ports
const popoutPorts: Set<chrome.runtime.Port> = new Set();

// WebSocket connection
let wsConnection: WebSocket | null = null;
let wsStreamerUsername: string | null = null;
// Reconnect attempt counter driving the exponential backoff. There is no
// maximum — like the web overlay, the extension retries indefinitely so a
// redeployment longer than the old ~55s cap no longer leaves the socket dead.
let wsReconnectAttempts = 0;
let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;


// Alarm name used to wake the service worker periodically so it can detect
// and recover from WebSocket drops caused by MV3 service worker termination.
// chrome.alarms is the only reliable keepalive mechanism in MV3 (setInterval
// does not prevent the worker from being evicted).
const KEEPALIVE_ALARM = 'allchat-ws-keepalive';

// chrome.storage.session key for persisting the active streamer across
// service worker restarts. Session storage is cleared when the browser closes.
const SESSION_STREAMER_KEY = 'ws_active_streamer';

// chrome.storage.session key persisting the reconnect attempt counter. Without
// this, an MV3 worker evicted mid-outage restarts at attempt 0 on wake, so its
// backoff resets to ~1s and every evicted worker hammers the server in lockstep
// on recovery. Persisting it lets a restarted worker resume the existing
// backoff. Session storage (not local) so it's cleared when the browser closes.
const SESSION_RECONNECT_ATTEMPTS_KEY = 'ws_reconnect_attempts';

/** Mirror the in-memory reconnect counter to session storage (best-effort). */
function persistReconnectAttempts(): void {
  chrome.storage.session.set({ [SESSION_RECONNECT_ATTEMPTS_KEY]: wsReconnectAttempts }).catch(() => {});
}

// In-memory mirror of the persisted `ws_last_seen` watermark for the active
// streamer, so the hot message path does not await storage on every frame. The
// key layout and the decisions around it live in ../lib/lastSeen.
let wsLastSeenMs = 0;

/**
 * Read the persisted watermark for a streamer. Returns 0 when there is none,
 * which is the first-ever-connect case: no `?since=` is sent, preserving the
 * gateway's deliberate "no history flood for a first-time viewer" policy.
 */
async function loadLastSeen(streamerUsername: string): Promise<number> {
  try {
    const key = lastSeenKey(streamerUsername);
    const stored = await chrome.storage.local.get(key);
    return coerceWatermark(stored[key]);
  } catch {
    // Storage unavailable: fall back to no watermark. Losing the replay is bad;
    // failing to connect at all is worse.
    return 0;
  }
}

/** Advance the watermark if this message is newer, and persist it. */
function advanceLastSeen(streamerUsername: string, timestampMs: number): void {
  const next = nextWatermark(wsLastSeenMs, timestampMs);
  if (next === wsLastSeenMs) return;
  wsLastSeenMs = next;
  chrome.storage.local.set({ [lastSeenKey(streamerUsername)]: next }).catch(() => {});
}

/**
 * Drop a streamer's watermark. Called when the active streamer changes:
 * replaying overlay A's window into overlay B's chat is worse than the gap it
 * would have filled.
 */
function clearLastSeen(streamerUsername: string): void {
  wsLastSeenMs = 0;
  chrome.storage.local.remove(lastSeenKey(streamerUsername)).catch(() => {});
}

/**
 * Locate the content-script-owning tab for a pop-out native-send request.
 *
 * We prefer a tab whose URL references the same video_id (for YouTube,
 * that's the /watch?v= or /live/ path segment). On the other platforms
 * the tab URL contains the streamer login instead. Returns the most
 * recently focused matching tab so users with multiple streams open get
 * the one they're actively watching.
 */
async function findNativeSendTab(
  platform: 'youtube' | 'twitch' | 'kick' | 'tiktok',
  videoId: string | undefined,
  streamer: string,
): Promise<number | null> {
  const urlPatterns: Record<typeof platform, string[]> = {
    youtube: ['*://www.youtube.com/watch*', '*://www.youtube.com/live/*'],
    twitch: ['*://www.twitch.tv/*'],
    kick: ['*://kick.com/*'],
    tiktok: [],
  };
  const patterns = urlPatterns[platform];
  if (patterns.length === 0) return null;

  const tabs = await chrome.tabs.query({ url: patterns });
  if (tabs.length === 0) return null;

  // For YouTube, match by videoId first — multiple streams may be open.
  if (platform === 'youtube' && videoId) {
    const match = tabs.find(
      t => t.url?.includes(`v=${videoId}`) || t.url?.includes(`/live/${videoId}`),
    );
    if (match?.id != null) return match.id;
  }

  // Otherwise match by streamer handle in the URL path.
  const streamerLower = streamer.toLowerCase();
  const byStreamer = tabs.find(t => t.url?.toLowerCase().includes(`/${streamerLower}`));
  if (byStreamer?.id != null) return byStreamer.id;

  // Fall back to the most-recently-focused tab of the platform.
  tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return tabs[0]?.id ?? null;
}

// Handle pop-out window port connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== POPOUT_PORT_NAME) return;

  console.log('[AllChat] Pop-out window connected via port');
  popoutPorts.add(port);

  port.onDisconnect.addListener(() => {
    console.log('[AllChat] Pop-out window disconnected');
    popoutPorts.delete(port);

    // Firefox authoritative close signal: the content script's Window reference
    // from `window.open()` is a dead cross-compartment wrapper, so it can't
    // detect the close via polling. The port disconnect is the only reliable
    // lifecycle event when the pop-out goes away (self-close, user X, navigate).
    // Broadcast POPOUT_CLOSED to all platform tabs so the in-page iframes
    // restore their normal view. Tabs with no active pop-out ignore the message
    // (their iframes aren't in the "popped out" banner state).
    chrome.tabs.query({
      url: ['https://www.twitch.tv/*', 'https://www.youtube.com/*', 'https://kick.com/*', 'https://studio.youtube.com/*'],
    }, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'POPOUT_CLOSED_REMOTE' }).catch(() => { /* tab not listening */ });
        }
      });
    });
  });
});

// Restore WebSocket connection if the service worker was restarted while a
// session was active (e.g. due to MV3 30-second idle eviction).
(async () => {
  const result = await chrome.storage.session.get([SESSION_STREAMER_KEY, SESSION_RECONNECT_ATTEMPTS_KEY]);
  const savedStreamer = result[SESSION_STREAMER_KEY] as string | undefined;
  if (savedStreamer) {
    // Resume the existing backoff rather than restarting at attempt 0.
    wsReconnectAttempts = (result[SESSION_RECONNECT_ATTEMPTS_KEY] as number | undefined) ?? 0;
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
    // Trigger migration for existing users by reading storage (migration runs in getSyncStorage)
    getSyncStorage();
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

        case 'SEND_NATIVE_CHAT': {
          // Pop-out path: the pop-out window has no parent tab to
          // postMessage to, so it asks us to route the send through the
          // content script on the original YouTube tab. Using the
          // content script keeps the InnerTube call inside a document
          // that owns YouTube's cookies (SAPISID for the auth hash).
          try {
            const tabId = await findNativeSendTab(message.platform, message.videoId, message.streamer);
            if (tabId == null) {
              sendResponse({
                success: false,
                error: 'Open the stream in a YouTube tab to send native-style messages from the pop-out',
              });
              break;
            }
            const result = await chrome.tabs.sendMessage(tabId, {
              type: 'SEND_NATIVE_CHAT',
              message: message.message,
            });
            sendResponse(result ?? { success: false, error: 'No response from content script' });
          } catch (err: unknown) {
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : 'Failed to route pop-out send',
            });
          }
          break;
        }

        case 'DO_LOGIN': {
          const loginUrl = await initiateAuthUrl(message.platform, message.streamerUsername);
          sendResponse({ success: true, data: { loginUrl } });
          break;
        }

        case 'OPEN_AUTH_TAB': {
          await openAuthTab(message.platform, message.streamerUsername);
          sendResponse({ success: true });
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

        case 'GET_COSMETICS': {
          const cosToken = await getViewerToken();
          if (!cosToken) {
            sendResponse({ success: true, data: null });
            break;
          }
          const apiUrl = await getApiGatewayUrl();
          const cosResp = await fetch(`${apiUrl}/api/v1/auth/viewer/cosmetics`, {
            headers: { Authorization: `Bearer ${cosToken}` },
          });
          if (cosResp.ok) {
            const cosmetics = await cosResp.json();
            // Sync to local storage so it's available offline
            if (cosmetics.name_gradient) {
              await setLocalStorage({ viewer_name_gradient: JSON.stringify(cosmetics.name_gradient) });
            }
            if (cosmetics.name_color) {
              await setLocalStorage({ viewer_name_color: cosmetics.name_color });
            }
            sendResponse({ success: true, data: cosmetics });
          } else {
            sendResponse({ success: true, data: null });
          }
          break;
        }

        case 'LOGOUT':
          // Deliberate logout: mark intent before clearing so the overlay's storage.onChanged
          // recovery flips to logged-out silently rather than toasting "Session expired" (item 2).
          await markIntentionalLogout();
          await clearViewerAuth();
          sendResponse({ success: true });
          break;

        case 'STORE_VIEWER_TOKEN':
          await storeViewerToken(message.token);
          sendResponse({ success: true });
          break;

        case 'SET_CURRENT_PLATFORM':
          await chrome.storage.session.set({ current_platform: message.platform });
          // Update toolbar icon based on platform's enabled state (per D-07)
          {
            const settings = await getSyncStorage();
            const platform = message.platform as keyof typeof settings.platformEnabled;
            const enabled = settings.platformEnabled[platform] ?? true;
            const iconPath = enabled
              ? { 16: 'assets/icon-16.png', 32: 'assets/icon-32.png' }
              : { 16: 'assets/icon-16-gray.png', 32: 'assets/icon-32-gray.png' };
            if (sender.tab?.id) {
              chrome.action.setIcon({ tabId: sender.tab.id, path: iconPath });
            }
          }
          sendResponse({ success: true });
          break;

        case 'GET_CONNECTION_STATE':
          sendResponse({
            success: true,
            data: {
              state: currentConnectionState,
              attempts: wsReconnectAttempts
            }
          });
          break;

        case 'CLOSE_POPOUT_WINDOWS':
          // Firefox fallback: content scripts can't reliably call `popoutWindow.close()`
          // on an extension-page popup. Tell every connected pop-out to self-close.
          broadcastToPorts({ type: 'POPOUT_SELF_CLOSE' });
          sendResponse({ success: true });
          break;

        // --- Engagement (polls / predictions / points, PR #524 / backend ADR-0031;
        //     extension-side architecture: docs/adr/007) ---
        // The SW is the API proxy: it resolves the base URL, attaches the viewer JWT,
        // and calls the streamer-keyed endpoints, so the overlay id never reaches a
        // page context and background fetches (no Origin) pass the gateway OriginCheck.
        case 'ENGAGEMENT_ACTIVE': {
          // Public aggregate — no token needed. A 404 (no public overlay / went private) is
          // a DEFINITIVE "no round" → data:null so the panel clears; a 5xx/transport error
          // is transient → success:false so the client keeps the last render.
          const res = await engagementFetch(message.streamerUsername, '/active', { method: 'GET', auth: false });
          if (res.ok) {
            sendResponse({ success: true, data: res.data });
          } else if (res.status >= 400 && res.status < 500 && res.status !== 401) {
            // Any 4xx except 401 is a DEFINITIVE answer, not a transient blip: 404 = overlay
            // went private / no public round, 400 = bad request. Map to data:null so the panel
            // clears. Only 5xx / transport errors stay transient (success:false → the client
            // keeps the last render). 401 is excluded defensively — /active is unauthenticated,
            // so a 401 signals a gateway misconfig, not "no round" (item 4).
            sendResponse({ success: true, data: null });
          } else {
            sendResponse({ success: false, error: readErrorMessage(res.data) || 'ACTIVE_FAILED' });
          }
          break;
        }

        case 'ENGAGEMENT_ME': {
          // Per-viewer snapshot (balance + this viewer's vote/wager). Logged-out is a
          // normal state, not an error: return null so the panel shows aggregates only.
          const token = await getViewerToken();
          if (!token) {
            sendResponse({ success: true, data: null });
            break;
          }
          const res = await engagementFetch(message.streamerUsername, '/me', { method: 'GET', auth: true });
          // A server 401 on a token still valid *locally* means it was revoked/rotated (key
          // rotation, ban) — drop it so the overlay's storage.onChanged recovery re-prompts
          // login instead of leaving a stale authed UI whose every vote/wager 401s. Keep
          // data:null (preserve) for 5xx/transport, mirroring the ACTIVE handler's split (item 8).
          if (res.status === 401) {
            await clearViewerAuth();
          }
          sendResponse(res.ok
            ? { success: true, data: res.data }
            : { success: true, data: null });
          break;
        }

        case 'ENGAGEMENT_VOTE': {
          const res = await engagementFetch(message.streamerUsername, '/vote', {
            method: 'POST',
            auth: true,
            body: { poll_id: message.pollId, option_idx: message.optionIdx },
          });
          sendResponse(res.ok
            ? { success: true, data: res.data }
            : { success: false, error: readErrorMessage(res.data) || 'VOTE_FAILED', data: res.data });
          break;
        }

        case 'ENGAGEMENT_WAGER': {
          const res = await engagementFetch(message.streamerUsername, '/wager', {
            method: 'POST',
            auth: true,
            body: { prediction_id: message.predictionId, outcome_idx: message.outcomeIdx, amount: message.amount },
          });
          // Carry the machine-readable `reason` (insufficient, already_wagered, …) through
          // on `data` so the panel can render actionable copy.
          sendResponse(res.ok
            ? { success: true, data: res.data }
            : { success: false, error: readErrorMessage(res.data) || 'WAGER_FAILED', data: res.data });
          break;
        }

        case 'ENGAGEMENT_HEARTBEAT': {
          const res = await engagementFetch(message.streamerUsername, '/heartbeat', { method: 'POST', auth: true, body: {} });
          sendResponse(res.ok
            ? { success: true, data: res.data }
            : { success: false, error: readErrorMessage(res.data) || 'HEARTBEAT_FAILED' });
          break;
        }

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

  const response = await fetch(fetchUrl);

  if (response.status === 404) {
    throw new Error('STREAMER_NOT_FOUND');
  }

  if (!response.ok) {
    throw new Error('FETCH_FAILED');
  }

  return response.json();
}

/**
 * Ask over HTTP whether a viewer connection to this streamer would be accepted.
 *
 * This is the deterministic answer that close code 1006 cannot give — see
 * src/lib/closeReason.ts for why. The mapping is deliberately conservative:
 * only an explicit denial produces 'not-public'.
 *
 * - 200 with `viewer_public: false`  -> 'not-public' (the streamer has not
 *   enabled the setting; retrying will never help)
 * - 404 (STREAMER_NOT_FOUND)         -> 'not-public' (same, from the other end)
 * - 200 with `viewer_public: true`   -> 'reachable'
 * - 200 with the field absent        -> 'reachable', NOT 'not-public'. A
 *   gateway older than the field omits it, and reading that silence as a
 *   denial would resurrect the exact bug this replaces.
 * - anything else (5xx, network error, timeout, unparseable body)
 *                                    -> 'unreachable', which retries.
 */
async function probeStreamerAccess(username: string): Promise<StreamerProbeResult> {
  try {
    const info = await fetchStreamerInfo(username);
    return info.viewer_public === false ? 'not-public' : 'reachable';
  } catch (error: any) {
    if (error?.message === 'STREAMER_NOT_FOUND') return 'not-public';
    // FETCH_FAILED, a thrown TypeError from fetch, a JSON parse failure — all
    // transport-level. They say nothing about whether the overlay is public.
    return 'unreachable';
  }
}

/**
 * Connect to viewer WebSocket for real-time messages
 * Uses /ws/chat/{streamer} endpoint which does NOT trigger YouTube polling
 * and does not expose the secret overlay ID
 */
async function connectWebSocket(streamerUsername: string): Promise<void> {
  // If already connected to this streamer, re-broadcast current state so newly
  // created tab bars / iframes pick it up (e.g. after SPA navigation).
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN && wsStreamerUsername === streamerUsername) {
    console.log('[AllChat] Already connected to streamer:', streamerUsername);
    broadcastConnectionState('connected');
    return;
  }

  // Switching streamers: drop the outgoing one's watermark before we lose the
  // handle on it. Replaying overlay A's window into overlay B's chat is worse
  // than the gap it would have filled.
  if (wsStreamerUsername && wsStreamerUsername !== streamerUsername) {
    clearLastSeen(wsStreamerUsername);
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

  // Recover the gap. The viewer endpoint requires an explicit ?since= to replay
  // anything at all — unlike the owner endpoint, a missing value means "send
  // nothing", not "send everything", so that a first-time viewer is not dropped
  // into five minutes of chat they never saw. That policy is right, but until
  // now the extension sent no ?since= ever, which made it the one client
  // reconnecting most often and recovering nothing: not after a redeploy, not
  // after an MV3 eviction, not after a laptop woke up. Batch A made it reconnect
  // forever; without this it reconnected forever into a hole.
  //
  // A watermark of 0 means we have never seen a message from this streamer, so
  // we send no ?since= and inherit the first-time-viewer policy deliberately.
  wsLastSeenMs = await loadLastSeen(streamerUsername);

  // Use viewer-specific endpoint (does NOT trigger polling or expose overlay ID)
  // Auth is sent as first WebSocket message instead of URL query parameter
  const url = buildViewerSocketUrl(wsUrl, streamerUsername, wsLastSeenMs);

  console.log('[AllChat] Connecting to viewer WebSocket:', url);

  // Broadcast connecting state
  const state = wsReconnectAttempts > 0 ? 'reconnecting' : 'connecting';
  broadcastConnectionState(state);

  wsConnection = new WebSocket(url);
  wsStreamerUsername = streamerUsername;

  wsConnection.onopen = async () => {
    console.log('[AllChat] WebSocket connected successfully!');
    wsReconnectAttempts = 0;
    persistReconnectAttempts();
    startWebSocketHeartbeat();

    // Authenticate via first message instead of URL param
    const token = await getViewerToken();
    if (token && wsConnection) {
      wsConnection.send(JSON.stringify({ type: 'auth', data: { token } }));
    }

    // Update extension badge
    chrome.action.setBadgeBackgroundColor({ color: '#00ff00' });
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setTitle({ title: 'AllChat' });

    // Broadcast connected state
    broadcastConnectionState('connected');
  };

  wsConnection.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
        console.warn('[AllChat] Ignoring WebSocket message with invalid structure');
        return;
      }

      // Advance the `ws_last_seen` watermark on anything carrying a message
      // timestamp, so the next reconnect asks for the gap starting here.
      // Replayed frames count too: they are messages we have now seen.
      if (advancesWatermark(message.type)) {
        advanceLastSeen(streamerUsername, extractMessageTimestamp(message));
      }

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

  wsConnection.onclose = async (event) => {
    console.log('[AllChat] WebSocket closed - Code:', event.code, 'Reason:', event.reason, 'Clean:', event.wasClean);
    stopWebSocketHeartbeat();
    chrome.action.setBadgeBackgroundColor({ color: '#888888' });
    chrome.action.setBadgeText({ text: '' });

    // Clear any pending reconnect timeout
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }

    // An explicit disconnectWebSocket() nulls wsStreamerUsername, and switching
    // streamers overwrites it. Either way this socket is no longer the one the
    // extension cares about, so bail before spending an HTTP probe on it.
    if (wsStreamerUsername !== streamerUsername) {
      console.log('[AllChat] Ignoring close for stale connection:', streamerUsername);
      return;
    }

    // Why not just read the close code: the gateway rejects a streamer with no
    // public overlay *before* the WebSocket upgrade, with an HTTP 404 that JS
    // never sees. The browser reports 1006 with an empty reason — the same thing
    // it reports for DNS failure, TLS trouble, a cold-start proxy, and a gateway
    // rolling mid-connect. The old test (`1006 && attempts === 0`) could not tell
    // these apart, and matching meant never retrying, so any first-attempt blip
    // silenced the extension until someone reset it by hand.
    //
    // So we ask over HTTP instead. Only an explicit viewer_public: false from a
    // healthy 200 stops the loop; a 5xx, a timeout or an unparseable body is a
    // transport failure and falls through to reconnect. Application close codes
    // (4000-4999) are the gateway speaking deliberately and need no probe.
    const probeResult = isApplicationCloseCode(event.code)
      ? undefined
      : await probeStreamerAccess(streamerUsername);

    if (decideCloseAction(event.code, probeResult) === 'stop') {
      console.error('[AllChat] Not reconnecting — close code', event.code, 'probe', probeResult);
      chrome.action.setBadgeBackgroundColor({ color: '#ff9900' });
      chrome.action.setBadgeText({ text: '!' });

      // Two ways to reach a stop, and they are not the same fact. Only say the
      // overlay is not public when the probe actually established that; an
      // application close code says the gateway refused this connection
      // deliberately, without telling us why.
      broadcastConnectionState('failed', probeResult === 'not-public'
        ? {
            error: 'OVERLAY_NOT_PUBLIC',
            message: `${streamerUsername} has not enabled "Public for Viewers" on their overlay. They need to enable this setting at allch.at`,
          }
        : {
            error: 'CONNECTION_REFUSED',
            message: `The server closed the connection to ${streamerUsername}'s chat and asked us not to retry (code ${event.code}).`,
          });
      return;
    }

    // Re-check: the probe above is an await, and a disconnect or a streamer
    // switch can land while it is in flight. Scheduling a retry now would
    // resurrect a connection the user closed.
    if (wsStreamerUsername !== streamerUsername) {
      console.log('[AllChat] Stale close handler for', streamerUsername, '— a newer connection took over');
      return;
    }

    // Attempt reconnection — no attempt cap (matches the web overlay, which
    // retries indefinitely). Exponential backoff with jitter bounds the retry
    // rate, so a redeploy longer than the old ~55s / 10-attempt cap no longer
    // leaves the socket permanently dead.
    wsReconnectAttempts++;
    persistReconnectAttempts();
    const delay = computeBackoffDelay(wsReconnectAttempts);
    console.log(`[AllChat] Reconnecting in ${Math.round(delay)}ms (attempt ${wsReconnectAttempts})`);

    // Reconnecting badge (orange) + tooltip — visible signal that the socket
    // is down and retrying, rather than the ambiguous cleared badge.
    chrome.action.setBadgeBackgroundColor({ color: '#ff9900' });
    chrome.action.setBadgeText({ text: '↻' });
    chrome.action.setTitle({ title: 'AllChat — reconnecting…' });

    // Broadcast reconnecting state with countdown
    broadcastConnectionState('reconnecting', {
      reconnectIn: delay,
    });

    reconnectTimeoutId = setTimeout(() => {
      if (wsStreamerUsername) {
        connectWebSocket(wsStreamerUsername);
      }
    }, delay);
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
 * Broadcast a message to all connected pop-out window ports.
 * Called alongside tab-based broadcast in broadcastConnectionState and handleWebSocketMessage.
 */
function broadcastToPorts(message: Record<string, unknown>): void {
  popoutPorts.forEach((port) => {
    try {
      port.postMessage(message);
    } catch (err) {
      console.warn('[AllChat] Failed to send to pop-out port, removing:', err);
      popoutPorts.delete(port);
    }
  });
}

/**
 * Broadcast connection state to all tabs
 */
function broadcastConnectionState(state: ConnectionState, details?: any): void {
  currentConnectionState = state;

  console.log('[AllChat] Broadcasting connection state:', state);

  chrome.tabs.query({ url: ['https://www.twitch.tv/*', 'https://www.youtube.com/*', 'https://kick.com/*'] }, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CONNECTION_STATE',
          data: {
            state,
            attempts: wsReconnectAttempts,
            ...details,
          },
          streamer: wsStreamerUsername,
        }).catch((err) => {
          console.warn(`[AllChat] Failed to send CONNECTION_STATE to tab ${tab.id}:`, err.message);
        });
      }
    });
  });

  // Also broadcast to pop-out windows via ports
  broadcastToPorts({
    type: 'CONNECTION_STATE',
    data: {
      state,
      attempts: wsReconnectAttempts,
      ...details,
    },
  });
}

/**
 * Handle WebSocket message and broadcast to content scripts
 */
function handleWebSocketMessage(message: any): void {
  console.log('[AllChat] WebSocket message:', message.type);

  chrome.tabs.query({ url: ['https://www.twitch.tv/*', 'https://www.youtube.com/*', 'https://kick.com/*'] }, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'WS_MESSAGE',
          data: message,
          streamer: wsStreamerUsername,
        }).catch((err) => {
          console.warn(`[AllChat] Failed to send WS_MESSAGE to tab ${tab.id}:`, err.message);
        });
      }
    });
  });

  // Also broadcast to pop-out windows via ports
  broadcastToPorts({ type: 'WS_MESSAGE', data: message });
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
  // Fresh session — clear any stale logout-intent marker so it can't later mask a genuine
  // expiry as if it were a deliberate logout (item 2).
  await clearLogoutIntent();

  try {
    const viewerInfo = await fetchViewerMe(token);
    await setLocalStorage({ viewer_info: viewerInfo });
  } catch (error) {
    console.error('[AllChat] Failed to fetch viewer info:', error);
  }

  // Fetch cosmetics (name color, gradient) so the popup can display them
  try {
    const apiUrl = await getApiGatewayUrl();
    const resp = await fetch(`${apiUrl}/api/v1/auth/viewer/cosmetics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      const cosmetics = await resp.json();
      if (cosmetics.name_gradient) {
        await setLocalStorage({ viewer_name_gradient: JSON.stringify(cosmetics.name_gradient) });
      }
      if (cosmetics.name_color) {
        await setLocalStorage({ viewer_name_color: cosmetics.name_color });
      }
    }
  } catch (error) {
    console.error('[AllChat] Failed to fetch viewer cosmetics:', error);
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

/** Narrow the `error` string out of an engagement response body without an `any` cast (item 6). */
function readErrorMessage(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'error' in data) {
    const { error } = data as { error?: unknown };
    if (typeof error === 'string') return error;
  }
  return undefined;
}

/**
 * Call a streamer-keyed engagement endpoint (PR #524 / backend ADR-0031). Centralizes the
 * base-URL resolution, viewer-JWT attachment, and JSON parsing for the engagement
 * message handlers. Authenticated calls use ensureValidToken so an expired session is
 * cleared and reported as 401 rather than silently failing. Returns the parsed body
 * (or null) alongside ok/status so callers can surface the `reason` on a rejection.
 */
async function engagementFetch(
  streamer: string,
  path: string,
  init: { method: 'GET' | 'POST'; auth: boolean; body?: unknown },
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const apiUrl = await getApiGatewayUrl();
  const headers: Record<string, string> = {};
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (init.auth) {
    const token = await ensureValidToken();
    if (!token) {
      return { ok: false, status: 401, data: { error: 'NOT_AUTHENTICATED' } };
    }
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = `${apiUrl}/api/v1/engagement/streamers/${encodeURIComponent(streamer)}${path}`;
  const response = await fetch(url, {
    method: init.method,
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* empty or non-JSON body */
  }
  return { ok: response.ok, status: response.status, data };
}

/**
 * Open a browser tab for OAuth and monitor it for the auth-success redirect.
 * Used for platforms (YouTube, Kick) whose OAuth providers do not accept the
 * extension's chrome.identity redirect URI. The backend handles the OAuth
 * callback and redirects to allch.at/chat/auth-success?token=... — we watch
 * for that URL, extract the token, store it, and broadcast AUTH_COMPLETE.
 */
async function openAuthTab(platform: string, streamerUsername?: string): Promise<void> {
  const loginUrl = await initiateAuthUrl(platform, streamerUsername);

  const tab = await chrome.tabs.create({ url: loginUrl, active: true });
  const tabId = tab.id;
  if (!tabId) return;

  const listener = async (
    updatedTabId: number,
    changeInfo: chrome.tabs.OnUpdatedInfo,
    updatedTab: chrome.tabs.Tab,
  ) => {
    if (updatedTabId !== tabId) return;
    if (changeInfo.status !== 'complete') return;

    const url = updatedTab.url ?? '';
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return;
    }
    if (parsedUrl.hostname !== 'allch.at' || !parsedUrl.pathname.startsWith('/chat/auth-success')) return;

    // Stop watching immediately to avoid duplicate handling
    chrome.tabs.onUpdated.removeListener(listener);
    chrome.tabs.remove(tabId).catch(() => {});

    const params = new URL(url).searchParams;
    const code = params.get('code');
    if (!code) {
      broadcastToAllExtensionContexts({ type: 'AUTH_COMPLETE', success: false, error: 'No auth code in callback URL' });
      return;
    }

    // Exchange short-lived code for JWT token
    try {
      const apiUrl = await getApiGatewayUrl();
      const resp = await fetch(`${apiUrl}/api/v1/auth/viewer/token/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!resp.ok) {
        broadcastToAllExtensionContexts({ type: 'AUTH_COMPLETE', success: false, error: 'Code exchange failed' });
        return;
      }
      const data = await resp.json() as { token: string };
      await storeViewerToken(data.token);
      broadcastToAllExtensionContexts({ type: 'AUTH_COMPLETE', success: true });
    } catch (err) {
      console.error('[AllChat] Token exchange failed:', err);
      broadcastToAllExtensionContexts({ type: 'AUTH_COMPLETE', success: false, error: 'Code exchange error' });
    }
  };

  chrome.tabs.onUpdated.addListener(listener);
}

/**
 * Broadcast a message to all extension contexts (popup, content scripts, pop-out ports).
 */
function broadcastToAllExtensionContexts(message: Record<string, unknown>): void {
  // Popup / other extension pages
  chrome.runtime.sendMessage(message).catch(() => {});
  // Pop-out windows connected via ports
  broadcastToPorts(message);
}

console.log('[AllChat] Service worker initialized');
