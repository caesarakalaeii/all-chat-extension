/**
 * Chat Container Component
 *
 * Main component that manages WebSocket connection and message state
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ChatMessage } from '../../lib/types/message';
import { ViewerInfo } from '../../lib/types/extension';
import { renderMessageContent } from '../../lib/renderMessage';
import { resolveTwitchBadgeIcons } from '../../lib/twitchBadges';
import { sortMessageBadges } from '../../lib/badgeOrder';
import { getLocalStorage, setLocalStorage, clearViewerAuth, getNameColor, getNameGradient } from '../../lib/storage';
import { API_BASE_URL } from '../../config';
import LoginPrompt from './LoginPrompt';
import MessageInput from './MessageInput';
import ToastContainer, { Toast } from './Toast';
import { InfinityLogo } from './InfinityLogo';
import { UserAvatar } from './UserAvatar';
import { AllChatBadge } from './AllChatBadge';
import { PremiumBadge } from './PremiumBadge';
import { POPOUT_PORT_NAME, POPOUT_MESSAGE_BUFFER_KEY, POPOUT_MAX_MESSAGES } from '../../lib/types/popout';

export type Platform = 'twitch' | 'youtube' | 'kick' | 'tiktok';

function getNativePopoutUrl(platform: Platform, streamer: string, twitchChannel?: string): string | null {
  switch (platform) {
    case 'twitch':
      return `https://www.twitch.tv/popout/${twitchChannel || streamer}/chat`;
    case 'youtube':
      return `https://www.youtube.com/live_chat?v=${streamer}&is_popout=1`;
    case 'kick':
      return null;
    default:
      return null;
  }
}

/**
 * Converts a parsed NameGradient object to a CSS linear-gradient() string.
 * Inlined here because the extension is a separate repo without @/lib/utils/gradient.
 */
type NameGradient = { type: string; colors: string[]; angle: number };

function buildGradientCSS(g: NameGradient): string {
  return `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})`;
}

function parseNameGradient(raw: string | undefined): NameGradient | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NameGradient;
  } catch {
    return null;
  }
}

function PlatformIcon({ platform }: { platform: Platform }) {
  switch (platform) {
    case 'twitch':
      return (
        <svg viewBox="0 0 24 24" className="inline-block w-4 h-4 flex-shrink-0">
          <title>Twitch</title>
          <path fill="#9146FF" d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" className="inline-block w-4 h-4 flex-shrink-0">
          <title>YouTube</title>
          <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      );
    case 'kick':
      return (
        <svg viewBox="0 0 24 24" className="inline-block w-4 h-4 flex-shrink-0" style={{ imageRendering: 'pixelated' }}>
          <title>Kick</title>
          <text x="12" y="18" fontSize="20" fontWeight="bold" fill="#00E701" textAnchor="middle" fontFamily="monospace">K</text>
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" className="inline-block w-4 h-4 flex-shrink-0">
          <title>TikTok</title>
          <path fill="#000000" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
        </svg>
      );
    default:
      return null;
  }
}

interface ChatContainerProps {
  platform: Platform;
  streamer: string;
  displayName: string;
  twitchChannel?: string;
  videoId?: string;
}

type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'failed';

interface ConnectionStatus {
  state: ConnectionState;
  attempts?: number;
  maxAttempts?: number;
  reconnectIn?: number;
  error?: string;
  message?: string;
}

export default function ChatContainer({ platform, streamer, displayName, twitchChannel, videoId }: ChatContainerProps) {
  // Detect pop-out mode via URL param (set by content script when opening pop-out window)
  const urlParams = new URLSearchParams(window.location.search);
  const isPopOut = urlParams.get('popout') === '1';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    state: 'connecting',
  });
  const [viewerToken, setViewerToken] = useState<string | null>(null);
  const [viewerInfo, setViewerInfo] = useState<ViewerInfo | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [viewerNameColor, setViewerNameColor] = useState<string | null>(null);
  const [viewerNameGradient, setViewerNameGradient] = useState<string | null>(null);
  const [isPoppedOut, setIsPoppedOut] = useState(false); // in-page: true when pop-out window is open

  // Parse gradient JSON string for use in style — null when absent or invalid
  const parsedGradient = useMemo(
    () => parseNameGradient(viewerNameGradient ?? undefined),
    [viewerNameGradient],
  );

  // Mode-aware helper: send messages to content script or service worker
  const sendToContentScript = (message: Record<string, unknown>) => {
    if (isPopOut) {
      chrome.runtime.sendMessage(message).catch((err) => {
        console.warn('[AllChat UI] sendMessage error:', err);
      });
    } else {
      window.parent.postMessage(message, '*');
    }
  };

  // Debug: Log connection status changes
  useEffect(() => {
    console.log('[AllChat UI] connectionStatus changed to:', connectionStatus);
  }, [connectionStatus]);

  // Load viewer authentication and collapse state on mount
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const storage = await getLocalStorage();
        if (storage.viewer_jwt_token && storage.viewer_info) {
          // Validate token expiry before accepting it (fixes stale expired tokens
          // keeping the UI stuck on MessageInput instead of showing LoginPrompt)
          try {
            const payload = JSON.parse(atob(storage.viewer_jwt_token.split('.')[1]));
            if (payload.exp && Date.now() >= payload.exp * 1000) {
              console.log('[AllChat UI] Stored token expired, clearing auth');
              await clearViewerAuth();
            } else {
              setViewerToken(storage.viewer_jwt_token);
              setViewerInfo(storage.viewer_info);
            }
          } catch {
            console.warn('[AllChat UI] Failed to decode stored token, clearing auth');
            await clearViewerAuth();
          }
        }
        const color = await getNameColor();
        setViewerNameColor(color);
        const gradient = await getNameGradient();
        setViewerNameGradient(gradient);

        // In pop-out mode: load message history from chrome.storage.local buffer
        if (isPopOut) {
          try {
            const result = await chrome.storage.local.get(POPOUT_MESSAGE_BUFFER_KEY);
            const buffer = result[POPOUT_MESSAGE_BUFFER_KEY];
            if (buffer) {
              const parsed = JSON.parse(buffer as string) as ChatMessage[];
              setMessages(parsed);
              // Clean up the buffer after reading
              await chrome.storage.local.remove(POPOUT_MESSAGE_BUFFER_KEY);
              console.log(`[AllChat UI] Loaded ${parsed.length} messages from pop-out buffer`);
            }
          } catch (err) {
            console.error('[AllChat UI] Failed to load pop-out message buffer:', err);
          }
        }

        // Load collapse state from localStorage (only relevant in in-page mode)
        if (!isPopOut && storage.ui_collapsed !== undefined) {
          setIsCollapsed(storage.ui_collapsed);
          // Notify parent window of initial collapsed state
          window.parent.postMessage({
            type: 'UI_COLLAPSED',
            collapsed: storage.ui_collapsed
          }, '*');
        }
      } catch (err) {
        console.error('[AllChat UI] Failed to load auth:', err);
      } finally {
        setLoadingAuth(false);
      }
    };

    loadAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle incoming messages from either postMessage or chrome.runtime.Port
  const handleIncomingMessage = (data: Record<string, unknown>) => {
    if (!data || !data.type) return;

    console.log('[AllChat UI] Received message:', data.type, data);

    // Handle connection state updates
    if (data.type === 'CONNECTION_STATE') {
      const status = data.data as ConnectionStatus;
      console.log('[AllChat UI] Connection state:', status.state, 'Full status:', status);
      setConnectionStatus(status);
      console.log('[AllChat UI] setConnectionStatus called with:', status);

      // Start countdown if reconnecting
      if (status.state === 'reconnecting' && status.reconnectIn) {
        setReconnectCountdown(Math.ceil(status.reconnectIn / 1000));
      } else {
        setReconnectCountdown(null);
      }
      return;
    }

    // Messages come through parent window from content script
    if (data.type === 'WS_MESSAGE') {
      const wsMessage = data.data as { type: string; data?: ChatMessage };
      if (wsMessage.type === 'connected') {
        console.log('[AllChat UI] Connected to chat stream');
      } else if (wsMessage.type === 'chat_message') {
        console.log('[AllChat UI] Received chat message');

        // Process the message: sort badges and resolve badge icons
        let processedMessage = wsMessage.data as ChatMessage;
        processedMessage = sortMessageBadges(processedMessage);

        // Add the message immediately (deduplicated by ID), then update in-place when badge icons resolve
        setMessages((prev) => {
          if (processedMessage.id && prev.some((m) => m.id === processedMessage.id)) {
            return prev; // Already present — discard duplicate delivery
          }
          return [...prev, processedMessage].slice(-50);
        });

        resolveTwitchBadgeIcons(processedMessage).then((enrichedMessage) => {
          setMessages((prev) => {
            const existingIndex = prev.findIndex((m) => m.id === enrichedMessage.id);
            if (existingIndex !== -1) {
              const updated = [...prev];
              updated[existingIndex] = enrichedMessage;
              return updated.slice(-50);
            }
            // Message was evicted from the 50-message window before badges resolved — discard
            return prev;
          });
        });
      } else if (wsMessage.type === 'ping') {
        // Ignore pings
      }
    }

    // Pop-out state changes
    if (data.type === 'POPOUT_OPENED') {
      setIsPoppedOut(true);
    }
    if (data.type === 'POPOUT_CLOSED') {
      setIsPoppedOut(false);
    }
  };

  useEffect(() => {
    console.log('[AllChat UI] Listening for WebSocket messages...');

    if (isPopOut) {
      // Pop-out mode: use chrome.runtime.Port for direct SW communication
      const port = chrome.runtime.connect({ name: POPOUT_PORT_NAME });

      port.onMessage.addListener((message: Record<string, unknown>) => {
        handleIncomingMessage(message);
      });

      // Handle port disconnect (SW restart) — reconnect with backoff
      port.onDisconnect.addListener(() => {
        console.warn('[AllChat UI PopOut] Port disconnected, reconnecting...');
        // Retry connection after 1s
        setTimeout(() => {
          const newPort = chrome.runtime.connect({ name: POPOUT_PORT_NAME });
          newPort.onMessage.addListener((message: Record<string, unknown>) => {
            handleIncomingMessage(message);
          });
          // Re-request connection state
          chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATE' }).then((response) => {
            if (response?.success) {
              handleIncomingMessage({ type: 'CONNECTION_STATE', data: response.data });
            }
          }).catch((err) => {
            console.warn('[AllChat UI PopOut] GET_CONNECTION_STATE error:', err);
          });
        }, 1000);
      });

      // Connect websocket via direct sendMessage (not postMessage)
      chrome.runtime.sendMessage({ type: 'CONNECT_WEBSOCKET', streamerUsername: streamer }).catch((err) => {
        console.warn('[AllChat UI PopOut] CONNECT_WEBSOCKET error:', err);
      });
      chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATE' }).then((response) => {
        if (response?.success) {
          handleIncomingMessage({ type: 'CONNECTION_STATE', data: response.data });
        }
      }).catch((err) => {
        console.warn('[AllChat UI PopOut] GET_CONNECTION_STATE error:', err);
      });

      return () => port.disconnect();
    } else {
      // In-page iframe mode: use existing window.parent.postMessage relay
      window.parent.postMessage({ type: 'GET_CONNECTION_STATE' }, '*');
      console.log('[AllChat UI] Requested current connection state');

      const messageHandler = (event: MessageEvent) => {
        handleIncomingMessage(event.data as Record<string, unknown>);
      };
      window.addEventListener('message', messageHandler);

      return () => window.removeEventListener('message', messageHandler);
    }
  }, [isPopOut, streamer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer for reconnection
  useEffect(() => {
    if (reconnectCountdown === null || reconnectCountdown <= 0) return;

    const timer = setTimeout(() => {
      setReconnectCountdown((prev) => (prev && prev > 0 ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [reconnectCountdown]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const container = document.getElementById('messages-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // Add toast notification
  const addToast = (message: string, type: Toast['type'] = 'info', duration?: number) => {
    const id = `${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, type, duration };
    setToasts((prev) => [...prev, toast]);
  };

  // Remove toast
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Handle successful login
  const handleLogin = async (token: string) => {
    console.log('[AllChat UI] Login successful, fetching viewer info...');

    try {
      // Fetch viewer info from API
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/viewer/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch viewer info');
      }

      const info: ViewerInfo = await response.json();

      // Store token and info
      await setLocalStorage({
        viewer_jwt_token: token,
        viewer_info: info,
      });

      setViewerToken(token);
      setViewerInfo(info);
      console.log('[AllChat UI] Viewer authenticated:', info.username);

      addToast(`Logged in as ${info.display_name || info.username}`, 'success');
    } catch (err) {
      console.error('[AllChat UI] Failed to complete login:', err);
      addToast('Failed to complete login. Please try again.', 'error');
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      if (viewerToken) {
        // Call logout endpoint
        await fetch(`${API_BASE_URL}/api/v1/auth/viewer/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${viewerToken}`,
          },
        });
      }
      addToast('Logged out successfully', 'info');
    } catch (err) {
      console.error('[AllChat UI] Logout error:', err);
      addToast('Logout error, but session cleared locally', 'warning');
    } finally {
      // Clear local storage regardless
      await clearViewerAuth();
      setViewerToken(null);
      setViewerInfo(null);
    }
  };

  // Handle auth error (token expired)
  const handleAuthError = async () => {
    console.log('[AllChat UI] Auth error, clearing session');
    await clearViewerAuth();
    setViewerToken(null);
    setViewerInfo(null);
    addToast('Session expired. Please log in again.', 'warning');
  };

  // Handle message sent successfully
  const handleMessageSent = () => {
    // Inline feedback handled by MessageInput — no toast needed
  };

  // Toggle collapse state and persist it (in-page only)
  const toggleCollapse = async () => {
    const newCollapsedState = !isCollapsed;
    setIsCollapsed(newCollapsedState);

    // Notify parent window to resize container
    sendToContentScript({
      type: 'UI_COLLAPSED',
      collapsed: newCollapsedState
    });

    try {
      await setLocalStorage({ ui_collapsed: newCollapsedState });
    } catch (err) {
      console.error('[AllChat UI] Failed to save collapse state:', err);
    }
  };

  // Handle pop-out button click — sends POPOUT_REQUEST to content script
  const handlePopOut = () => {
    // Send pop-out request to content script with current message buffer (T-06-03: cap at POPOUT_MAX_MESSAGES)
    const messagesToTransfer = messages.slice(-POPOUT_MAX_MESSAGES);
    sendToContentScript({
      type: 'POPOUT_REQUEST',
      platform,
      streamer,
      displayName,
      twitchChannel,
      videoId,
      messages: messagesToTransfer,
    });
  };

  // Handle "Switch to native" button click
  const handleSwitchToNative = () => {
    if (isPopOut) {
      const nativeUrl = getNativePopoutUrl(platform, streamer, twitchChannel);
      if (nativeUrl) {
        window.location.href = nativeUrl;
      }
    } else {
      sendToContentScript({ type: 'SWITCH_TO_NATIVE' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Header */}
      <div className="px-2 py-1.5 bg-surface border-b border-border flex items-center">
        {/* Left: collapse button (hidden in pop-out mode — standalone window has its own close) */}
        {!isPopOut && (
          <button
            onClick={toggleCollapse}
            className="text-[var(--color-text-dim)] hover:text-text transition-colors"
            title={isCollapsed ? 'Expand' : 'Collapse'}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <svg
              className="w-4 h-4 transition-transform"
              style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Center: InfinityLogo */}
        <div className="flex-1 flex justify-center">
          <InfinityLogo size={24} />
        </div>

        {/* Right: connection dot + platform badge + switch to native + pop-out */}
        <div className="flex items-center gap-1.5">
          {/* Connection dot */}
          <span className={`w-2 h-2 rounded-full ${
            connectionStatus.state === 'connected'    ? 'bg-green-400' :
            connectionStatus.state === 'connecting'   ? 'bg-yellow-400 animate-pulse' :
            connectionStatus.state === 'reconnecting' ? 'bg-yellow-400 animate-pulse' :
            connectionStatus.state === 'failed'       ? 'bg-red-400' :
                                                        'bg-[var(--color-text-dim)]'
          }`} title={connectionStatus.state} />
          {/* Platform badge */}
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: `var(--color-${platform})` }}
            title={platform}
          />
          {/* Switch to native button (per D-03) */}
          <button
            onClick={handleSwitchToNative}
            className="text-[var(--color-text-dim)] hover:text-text transition-colors flex items-center gap-0.5"
            title="Switch to native chat"
            aria-label="Switch to native chat"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-xs">Native</span>
          </button>
          {/* Pop-out button (per D-01, D-02) — rightmost in header; hidden when chat is already popped out */}
          {!isPoppedOut && (
            <button
              onClick={handlePopOut}
              className="text-[var(--color-text-dim)] hover:text-text transition-colors"
              title="Open in new window"
              aria-label="Open chat in new window"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
          {isPoppedOut ? (
            /* "Chat popped out" indicator banner (D-05) */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-bg">
              <InfinityLogo size={32} />
              <div className="text-sm text-[var(--color-text-sub)]">Chat is open in a separate window</div>
              <div className="text-[13px] text-[var(--color-text-dim)]">Your chat is running in the pop-out window.</div>
              <button
                onClick={() => sendToContentScript({ type: 'CLOSE_POPOUT' })}
                className="bg-[var(--color-surface-2)] hover:bg-[var(--color-neutral-700)] text-text text-xs px-3 py-1.5 rounded transition-colors"
              >
                Bring back chat
              </button>
            </div>
          ) : (
            <>
              {/* Connection Failed Banner */}
              {connectionStatus.state === 'failed' && (
                <div className={`px-3 py-2 border-b flex flex-col gap-2 ${
                  connectionStatus.error === 'OVERLAY_NOT_PUBLIC'
                    ? 'bg-orange-900/50 border-orange-700'
                    : 'bg-red-900/50 border-red-700'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      {connectionStatus.error === 'OVERLAY_NOT_PUBLIC' ? (
                        <>
                          <div className="text-sm font-medium text-orange-200">Overlay Not Public</div>
                          <div className="text-xs text-orange-300 mt-1">
                            {connectionStatus.message || `${streamer} needs to enable "Public for Viewers" in their overlay settings`}
                          </div>
                          <div className="text-xs text-orange-400 mt-1">
                            They can do this at <a href="https://allch.at" target="_blank" rel="noopener noreferrer" className="underline">allch.at</a>
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-red-200">Connection failed after {connectionStatus.maxAttempts} attempts</span>
                      )}
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className={`px-3 py-1 text-text text-xs rounded transition-colors ${
                        connectionStatus.error === 'OVERLAY_NOT_PUBLIC'
                          ? 'bg-orange-700 hover:bg-orange-600'
                          : 'bg-red-700 hover:bg-red-600'
                      }`}
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div id="messages-container" className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-[var(--color-text-dim)]">
                      <p className="text-sm">Waiting for messages...</p>
                      <p className="text-xs mt-1">Messages from {displayName} will appear here</p>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`message-enter p-2 rounded bg-surface/50 platform-${message.platform}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {/* Avatar (with optional frame and flair) */}
                        <UserAvatar
                          avatarUrl={message.user.avatar_url}
                          frameUrl={message.user.avatar_frame_url}
                          flairUrl={message.user.avatar_flair_url}
                          size={32}
                          displayName={message.user.display_name}
                        />

                        {/* Platform icon */}
                        <PlatformIcon platform={message.platform as Platform} />

                        {/* Badges */}
                        {message.user.badges?.map((badge, idx) => (
                          badge.name === 'allchat' ? (
                            <AllChatBadge key={idx} size={18} title={badge.name} />
                          ) : badge.name === 'allchat-premium' ? (
                            <PremiumBadge key={idx} size={18} title={badge.name} />
                          ) : badge.icon_url ? (
                            <img
                              key={idx}
                              src={badge.icon_url}
                              alt={badge.name}
                              style={{ height: '1em', width: 'auto', objectFit: 'contain', display: 'inline-block' }}
                              title={`${badge.name} (${badge.version})`}
                            />
                          ) : (
                            <span
                              key={idx}
                              title={badge.version ? `${badge.name} (${badge.version})` : badge.name}
                              style={{
                                display: 'inline-block',
                                fontSize: '0.65em',
                                lineHeight: '1',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                backgroundColor: 'var(--color-surface-2, #333)',
                                color: 'var(--color-text-sub, #aaa)',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.02em',
                                flexShrink: 0,
                              }}
                            >
                              {badge.version || badge.name}
                            </span>
                          )
                        ))}

                        {/* Username */}
                        {(() => {
                          const isOwnMessage = viewerInfo && message.user.username === viewerInfo.username;
                          // For the viewer's own messages, prefer the locally-stored gradient/color
                          // (which may differ from what the backend cached).
                          // For everyone else, use the gradient/color carried in the message itself.
                          const messageGradient = parseNameGradient(message.user.name_gradient);
                          const activeGradient: NameGradient | null = isOwnMessage
                            ? (parsedGradient ?? messageGradient)
                            : messageGradient;
                          const activeColor: string = isOwnMessage && viewerNameColor
                            ? viewerNameColor
                            : (message.user.color || '#fff');

                          if (activeGradient) {
                            return (
                              <span
                                className="font-semibold text-sm text-transparent"
                                style={{
                                  backgroundImage: buildGradientCSS(activeGradient),
                                  backgroundClip: 'text',
                                  WebkitBackgroundClip: 'text',
                                }}
                              >
                                {message.user.display_name || message.user.username}
                              </span>
                            );
                          }
                          return (
                            <span
                              className="font-semibold text-sm"
                              style={{ color: activeColor }}
                            >
                              {message.user.display_name || message.user.username}
                            </span>
                          );
                        })()}
                      </div>

                      {/* Message text with emotes */}
                      <div className="text-sm text-text">
                        {renderMessageContent(message)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer / Message Input */}
              {loadingAuth ? (
                <div className="px-3 py-3 bg-surface border-t border-border text-center">
                  <p className="text-xs text-[var(--color-text-dim)]">Loading...</p>
                </div>
              ) : viewerToken ? (
                <MessageInput
                  platform={platform}
                  streamer={streamer}
                  twitchChannel={twitchChannel}
                  videoId={videoId}
                  token={viewerToken}
                  onAuthError={handleAuthError}
                  onSendSuccess={handleMessageSent}
                />
              ) : (
                <div className="border-t border-border">
                  <LoginPrompt
                    platform={platform}
                    streamer={displayName}
                    onLogin={handleLogin}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
