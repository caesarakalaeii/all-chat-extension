/**
 * Chat Container Component
 *
 * Main component that manages WebSocket connection and message state
 */

import React, { useState, useEffect } from 'react';
import { ChatMessage } from '../../lib/types/message';
import { renderMessageContent } from '../../lib/renderMessage';
import { resolveTwitchBadgeIcons } from '../../lib/twitchBadges';
import { sortMessageBadges } from '../../lib/badgeOrder';

interface ChatContainerProps {
  overlayId: string;
  platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';
  streamer: string;
}

export default function ChatContainer({ overlayId, platform, streamer }: ChatContainerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    console.log('[AllChat UI] Listening for WebSocket messages...');

    // Listen for WebSocket messages from service worker
    const handleMessage = async (event: MessageEvent) => {
      // Messages come through parent window from content script
      if (event.data.type === 'WS_MESSAGE') {
        const wsMessage = event.data.data;

        if (wsMessage.type === 'connected') {
          console.log('[AllChat UI] Connected to overlay:', wsMessage.data.overlay_id);
          setConnected(true);
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const container = document.getElementById('messages-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">All-Chat</span>
          <span className="text-xs text-gray-400">• {platform}</span>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              Connected
            </span>
          ) : (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-400 rounded-full"></span>
              Disconnected
            </span>
          )}
        </div>
      </div>

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

      {/* Footer */}
      <div className="px-3 py-2 bg-gray-800 border-t border-gray-700">
        <p className="text-xs text-gray-500 text-center">
          Viewing chat for <span className="text-white">{streamer}</span>
        </p>
      </div>
    </div>
  );
}
