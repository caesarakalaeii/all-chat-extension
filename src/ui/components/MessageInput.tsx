import React, { useState, useRef, useEffect } from 'react';
import type { SendMessageRequest, SendMessageResponse } from '../../lib/types/viewer';

interface MessageInputProps {
  platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';
  streamer: string;
  token: string;
  onSendSuccess?: () => void;
  onAuthError?: () => void;
}

const API_BASE = 'http://localhost:8080';
const MAX_MESSAGE_LENGTH = 500;

export default function MessageInput({
  platform,
  streamer,
  token,
  onSendSuccess,
  onAuthError
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitReset, setRateLimitReset] = useState<Date | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Update rate limit countdown
  useEffect(() => {
    if (!rateLimitReset) return;

    const interval = setInterval(() => {
      const now = new Date();
      if (now >= rateLimitReset) {
        setRateLimitReset(null);
        setError(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [rateLimitReset]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = message.trim();
    if (!trimmed || sending) return;

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setError(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
      return;
    }

    setSending(true);
    setError(null);

    try {
      const requestBody: SendMessageRequest = {
        streamer_username: streamer,
        message: trimmed,
        platform,
      };

      const response = await fetch(`${API_BASE}/api/v1/auth/viewer/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data: SendMessageResponse = await response.json();

      if (response.status === 401) {
        // Token expired or invalid
        console.error('[AllChat MessageInput] Authentication error');
        onAuthError?.();
        setError('Session expired. Please log in again.');
        return;
      }

      if (response.status === 429) {
        // Rate limited
        const resetTime = data.reset_time ? new Date(data.reset_time * 1000) : new Date(Date.now() + 60000);
        setRateLimitReset(resetTime);
        setError('Rate limit exceeded. Please wait before sending another message.');
        return;
      }

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to send message');
      }

      // Success!
      setMessage('');
      onSendSuccess?.();
    } catch (err) {
      console.error('[AllChat MessageInput] Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const getRateLimitCountdown = () => {
    if (!rateLimitReset) return null;
    const now = new Date();
    const diff = Math.max(0, rateLimitReset.getTime() - now.getTime());
    const seconds = Math.ceil(diff / 1000);
    return seconds > 0 ? `${seconds}s` : null;
  };

  const countdown = getRateLimitCountdown();
  const isRateLimited = !!countdown;

  return (
    <div className="border-t border-gray-700 bg-gray-800 p-3">
      {error && (
        <div className="mb-2 p-2 bg-red-900/50 border border-red-700 rounded text-xs text-red-200">
          {error}
          {countdown && <span className="ml-2 font-semibold">({countdown})</span>}
        </div>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={isRateLimited ? `Rate limited (${countdown})` : 'Send a message...'}
          disabled={sending || isRateLimited}
          maxLength={MAX_MESSAGE_LENGTH}
          className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!message.trim() || sending || isRateLimited}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded text-sm transition-colors"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>

      <div className="mt-1 text-xs text-gray-500 text-right">
        {message.length}/{MAX_MESSAGE_LENGTH}
      </div>
    </div>
  );
}
