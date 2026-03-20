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

export type Platform = 'twitch' | 'youtube' | 'kick' | 'tiktok';

/**
 * Converts a parsed NameGradient object to a CSS linear-gradient() string.
 * Inlined here because the extension is a separate repo without @/lib/utils/gradient.
 */
function buildGradientCSS(g: { type: string; colors: string[]; angle: number }): string {
  return `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})`;
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

export default function ChatContainer({ platform, streamer, displayName }: ChatContainerProps) {
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

  // Parse gradient JSON string for use in style — null when absent or invalid
  const parsedGradient = useMemo((): { type: string; colors: string[]; angle: number } | null => {
    if (!viewerNameGradient) return null;
    try {
      return JSON.parse(viewerNameGradient) as { type: string; colors: string[]; angle: number };
    } catch {
      return null;
    }
  }, [viewerNameGradient]);

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
          setViewerToken(storage.viewer_jwt_token);
          setViewerInfo(storage.viewer_info);
        }
        const color = await getNameColor();
        setViewerNameColor(color);
        const gradient = await getNameGradient();
        setViewerNameGradient(gradient);
        // Load collapse state from localStorage
        if (storage.ui_collapsed !== undefined) {
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
  }, []);

  useEffect(() => {
    console.log('[AllChat UI] Listening for WebSocket messages...');

    // Request current connection state from parent window (content script will relay to service worker)
    window.parent.postMessage({ type: 'GET_CONNECTION_STATE' }, '*');
    console.log('[AllChat UI] Requested current connection state');

    // Listen for WebSocket messages from service worker
    const handleMessage = async (event: MessageEvent) => {
      console.log('[AllChat UI] Received message:', event.data.type, event.data);

      // Handle connection state updates
      if (event.data.type === 'CONNECTION_STATE') {
        const status: ConnectionStatus = event.data.data;
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
      if (event.data.type === 'WS_MESSAGE') {
        const wsMessage = event.data.data;

        if (wsMessage.type === 'connected') {
          console.log('[AllChat UI] Connected to chat stream');
        } else if (wsMessage.type === 'chat_message') {
          console.log('[AllChat UI] Received chat message');

          // Process the message: sort badges and resolve badge icons
          let processedMessage = wsMessage.data as ChatMessage;
          processedMessage = sortMessageBadges(processedMessage);

          // Resolve badge icons asynchronously (non-blocking)
          resolveTwitchBadgeIcons(processedMessage).then((enrichedMessage) => {
            setMessages((prev) => {
              // Replace the message if it exists, or add it
              const existingIndex = prev.findIndex((m) => m.id === enrichedMessage.id);
              if (existingIndex !== -1) {
                const updated = [...prev];
                updated[existingIndex] = enrichedMessage;
                return updated.slice(-50);
              } else {
                return [...prev, enrichedMessage].slice(-50);
              }
            });
          });

          // Add the message immediately (badges will be updated when resolved)
          setMessages((prev) => {
            const newMessages = [...prev, processedMessage];
            // Keep last 50 messages
            return newMessages.slice(-50);
          });
        } else if (wsMessage.type === 'ping') {
          // Ignore pings
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

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
    addToast('Message sent', 'success', 2000);
  };

  // Toggle collapse state and persist it
  const toggleCollapse = async () => {
    const newCollapsedState = !isCollapsed;
    setIsCollapsed(newCollapsedState);

    // Notify parent window to resize container
    window.parent.postMessage({
      type: 'UI_COLLAPSED',
      collapsed: newCollapsedState
    }, '*');

    try {
      await setLocalStorage({ ui_collapsed: newCollapsedState });
    } catch (err) {
      console.error('[AllChat UI] Failed to save collapse state:', err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Header */}
      <div className="px-2 py-1.5 bg-surface border-b border-border flex items-center">
        {/* Left: collapse button */}
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

        {/* Center: InfinityLogo */}
        <div className="flex-1 flex justify-center">
          <InfinityLogo size={24} />
        </div>

        {/* Right: connection dot + platform badge */}
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
        </div>
      </div>

      {!isCollapsed && (
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
                      ) : badge.name === 'premium' ? (
                        <PremiumBadge key={idx} size={18} title={badge.name} />
                      ) : badge.icon_url ? (
                        <img
                          key={idx}
                          src={badge.icon_url}
                          alt={badge.name}
                          style={{ height: '1em', width: 'auto', objectFit: 'contain', display: 'inline-block' }}
                          title={`${badge.name} (${badge.version})`}
                        />
                      ) : null
                    ))}

                    {/* Username */}
                    {(viewerInfo && message.user.username === viewerInfo.username && parsedGradient) ? (
                      <span
                        className="font-semibold text-sm bg-clip-text text-transparent"
                        style={{ backgroundImage: buildGradientCSS(parsedGradient) }}
                      >
                        {message.user.display_name || message.user.username}
                      </span>
                    ) : (
                      <span
                        className="font-semibold text-sm"
                        style={{
                          color: (viewerInfo && message.user.username === viewerInfo.username && viewerNameColor)
                            ? viewerNameColor
                            : (message.user.color || '#fff')
                        }}
                      >
                        {message.user.display_name || message.user.username}
                      </span>
                    )}
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

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
