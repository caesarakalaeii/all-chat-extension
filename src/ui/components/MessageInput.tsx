import React, { useState, useRef, useEffect } from 'react';
import type { SendMessageRequest, SendMessageResponse } from '../../lib/types/viewer';
import { API_BASE_URL } from '../../config';
import { fetchAllEmotes, filterEmotes, type EmoteData } from '../../lib/emoteAutocomplete';
import Autocomplete from './Autocomplete';

interface MessageInputProps {
  platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';
  streamer: string;
  token: string;
  onSendSuccess?: () => void;
  onAuthError?: () => void;
}

const API_BASE = API_BASE_URL;
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
  
  // Autocomplete state
  const [emotes, setEmotes] = useState<EmoteData[]>([]);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<EmoteData[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fetch emotes from all providers on mount
  useEffect(() => {
    const loadEmotes = async () => {
      try {
        const fetchedEmotes = await fetchAllEmotes(streamer);
        setEmotes(fetchedEmotes);
        console.log(`[AllChat Autocomplete] Loaded ${fetchedEmotes.length} emotes for ${streamer}`);
      } catch (err) {
        console.error('[AllChat Autocomplete] Failed to load emotes:', err);
      }
    };

    loadEmotes();
  }, [streamer]);

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

  // Handle autocomplete
  useEffect(() => {
    // Find the word being typed (after last space or at beginning)
    const cursorPosition = inputRef.current?.selectionStart || message.length;
    const textBeforeCursor = message.slice(0, cursorPosition);
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    const currentWord = textBeforeCursor.slice(lastSpaceIndex + 1);

    // Only show autocomplete if word starts with : and has at least 1 char after it
    if (currentWord.startsWith(':') && currentWord.length >= 2) {
      const searchQuery = currentWord.slice(1); // Remove the leading ':'
      const suggestions = filterEmotes(emotes, searchQuery, 10);
      setAutocompleteSuggestions(suggestions);
      setShowAutocomplete(suggestions.length > 0);
      setSelectedSuggestionIndex(0);
    } else {
      setShowAutocomplete(false);
      setAutocompleteSuggestions([]);
    }
  }, [message, emotes]);

  // Handle keyboard navigation for autocomplete
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAutocomplete || autocompleteSuggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          prev < autocompleteSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Tab':
      case 'Enter':
        if (showAutocomplete && selectedSuggestionIndex < autocompleteSuggestions.length) {
          e.preventDefault();
          selectEmote(autocompleteSuggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowAutocomplete(false);
        break;
    }
  };

  // Insert selected emote into message
  const selectEmote = (emote: EmoteData) => {
    const cursorPosition = inputRef.current?.selectionStart || message.length;
    const textBeforeCursor = message.slice(0, cursorPosition);
    const textAfterCursor = message.slice(cursorPosition);
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    
    // Replace the partial word with the full emote name
    const newTextBefore = textBeforeCursor.slice(0, lastSpaceIndex + 1) + emote.name;
    const newMessage = newTextBefore + ' ' + textAfterCursor;
    
    setMessage(newMessage);
    setShowAutocomplete(false);
    
    // Set cursor position after the inserted emote
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = newTextBefore.length + 1;
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        inputRef.current.focus();
      }
    }, 0);
  };

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

      // Try to parse JSON response first (for all status codes)
      let data: any = null;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        try {
          data = await response.json();
        } catch (e) {
          console.warn('[AllChat MessageInput] Failed to parse response JSON');
        }
      }

      // Handle error responses
      if (response.status === 401) {
        // Token expired or invalid
        console.error('[AllChat MessageInput] Authentication error');
        onAuthError?.();
        setError('Session expired. Please log in again.');
        return;
      }

      if (response.status === 403) {
        console.error('[AllChat MessageInput] Forbidden:', data);
        // Clear session on 403 - likely invalid/expired token
        onAuthError?.();
        const errorMsg = data?.error || 'You do not have permission to send messages in this chat.';
        const reason = data?.reason ? ` Reason: ${data.reason}` : '';
        setError(errorMsg + reason);
        return;
      }

      if (response.status === 429) {
        // Rate limited
        const resetTime = data?.reset_time ? new Date(data.reset_time * 1000) : new Date(Date.now() + 60000);
        setRateLimitReset(resetTime);
        setError('Rate limit exceeded. Please wait before sending another message.');
        return;
      }

      if (!response.ok) {
        const errorMsg = data?.details || data?.error || `Failed to send message (${response.status})`;
        throw new Error(errorMsg);
      }

      // Success!
      setMessage('');
      setError(null);
      onSendSuccess?.();
      
      // Restore focus to input field after sending
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } catch (err) {
      console.error('[AllChat MessageInput] Error sending message:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMsg);
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
    <div className="border-t border-gray-700 bg-gray-800 p-3 relative">
      {error && (
        <div className="mb-2 p-2 bg-red-900/50 border border-red-700 rounded text-xs text-red-200">
          {error}
          {countdown && <span className="ml-2 font-semibold">({countdown})</span>}
        </div>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRateLimited ? `Rate limited (${countdown})` : 'Send a message...'}
            disabled={sending || isRateLimited}
            maxLength={MAX_MESSAGE_LENGTH}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {showAutocomplete && (
            <Autocomplete
              suggestions={autocompleteSuggestions}
              selectedIndex={selectedSuggestionIndex}
              onSelect={selectEmote}
              onClose={() => setShowAutocomplete(false)}
              inputElement={inputRef.current}
            />
          )}
        </div>
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
