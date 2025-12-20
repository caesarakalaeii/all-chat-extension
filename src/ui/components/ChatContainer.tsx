/**
 * Chat Container Component
 *
 * Main component that manages WebSocket connection and message state
 */

import React, { useState, useEffect } from 'react';
import { ChatMessage } from '../../lib/types/message';
import { ViewerInfo } from '../../lib/types/extension';
import { renderMessageContent } from '../../lib/renderMessage';
import { resolveTwitchBadgeIcons } from '../../lib/twitchBadges';
import { sortMessageBadges } from '../../lib/badgeOrder';
import { getLocalStorage, setLocalStorage, clearViewerAuth } from '../../lib/storage';
import LoginPrompt from './LoginPrompt';
import MessageInput from './MessageInput';
import ToastContainer, { Toast } from './Toast';

interface ChatContainerProps {
  overlayId: string;
  platform: 'twitch' | 'youtube' | 'kick';
  streamer: string;
}

type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'failed';

interface ConnectionStatus {
  state: ConnectionState;
  attempts?: number;
  maxAttempts?: number;
  reconnectIn?: number;
}

export default function ChatContainer({ overlayId, platform, streamer }: ChatContainerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    state: 'connecting',
  });
  const [viewerToken, setViewerToken] = useState<string | null>(null);
  const [viewerInfo, setViewerInfo] = useState<ViewerInfo | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Load viewer authentication on mount
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const storage = await getLocalStorage();
        if (storage.viewer_jwt_token && storage.viewer_info) {
          setViewerToken(storage.viewer_jwt_token);
          setViewerInfo(storage.viewer_info);
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

    // Listen for WebSocket messages from service worker
    const handleMessage = async (event: MessageEvent) => {
      // Handle connection state updates
      if (event.data.type === 'CONNECTION_STATE') {
        const status: ConnectionStatus = event.data.data;
        console.log('[AllChat UI] Connection state:', status.state);
        setConnectionStatus(status);

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
          console.log('[AllChat UI] Connected to overlay:', wsMessage.data.overlay_id);
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
      const response = await fetch('http://localhost:8080/api/v1/auth/viewer/me', {
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
        await fetch('http://localhost:8080/api/v1/auth/viewer/logout', {
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

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">All-Chat</span>
          <span className="text-xs text-gray-400">• {platform}</span>
        </div>
        <div className="flex items-center gap-3">
          {viewerInfo && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{viewerInfo.display_name || viewerInfo.username}</span>
              <button
                onClick={handleLogout}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                title="Logout"
              >
                Logout
              </button>
            </div>
          )}
          {connectionStatus.state === 'connected' ? (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              Connected
            </span>
          ) : connectionStatus.state === 'connecting' ? (
            <span className="text-xs text-yellow-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
              Connecting
            </span>
          ) : connectionStatus.state === 'reconnecting' ? (
            <span className="text-xs text-yellow-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
              Reconnecting
              {reconnectCountdown !== null && reconnectCountdown > 0 && (
                <span className="text-gray-500">({reconnectCountdown}s)</span>
              )}
              {connectionStatus.attempts && connectionStatus.maxAttempts && (
                <span className="text-gray-500">
                  [{connectionStatus.attempts}/{connectionStatus.maxAttempts}]
                </span>
              )}
            </span>
          ) : connectionStatus.state === 'failed' ? (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-400 rounded-full"></span>
              Failed
            </span>
          ) : (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
              Disconnected
            </span>
          )}
        </div>
      </div>

      {/* Connection Failed Banner */}
      {connectionStatus.state === 'failed' && (
        <div className="px-3 py-2 bg-red-900/50 border-b border-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-200">Connection failed after {connectionStatus.maxAttempts} attempts</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded transition-colors"
          >
            Reload Page
          </button>
        </div>
      )}

      {/* Messages */}
      <div id="messages-container" className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <p className="text-sm">Waiting for messages...</p>
              <p className="text-xs mt-1">Messages from {streamer} will appear here</p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`message-enter p-2 rounded bg-gray-800/50 platform-${message.platform}`}
            >
              <div className="flex items-center gap-2 mb-1">
                {/* Badges */}
                {message.user.badges?.map((badge, idx) => (
                  badge.icon_url ? (
                    <img
                      key={idx}
                      src={badge.icon_url}
                      alt={badge.name}
                      className="w-4 h-4"
                      title={`${badge.name} (${badge.version})`}
                    />
                  ) : null
                ))}

                {/* Username */}
                <span
                  className="font-semibold text-sm"
                  style={{ color: message.user.color || '#fff' }}
                >
                  {message.user.display_name || message.user.username}
                </span>

                {/* Platform indicator */}
                <span className="text-xs text-gray-500">({message.platform})</span>
              </div>

              {/* Message text with emotes */}
              <div className="text-sm text-gray-200">
                {renderMessageContent(message)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer / Message Input */}
      {loadingAuth ? (
        <div className="px-3 py-3 bg-gray-800 border-t border-gray-700 text-center">
          <p className="text-xs text-gray-500">Loading...</p>
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
        <div className="border-t border-gray-700">
          <LoginPrompt
            platform={platform}
            streamer={streamer}
            onLogin={handleLogin}
          />
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
