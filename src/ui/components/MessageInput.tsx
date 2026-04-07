import React, { useState, useRef, useEffect } from 'react';
import type { SendMessageRequest, SendMessageResponse } from '../../lib/types/viewer';
import { API_BASE_URL } from '../../config';
import { fetchAllEmotes, filterEmotes, type EmoteData } from '../../lib/emoteAutocomplete';
import Autocomplete from './Autocomplete';
import { parseApiError, parseFetchError } from '../../lib/errorParser';
import type { ChatError } from '../../lib/types/errors';
import { ChatErrorType } from '../../lib/types/errors';
import ErrorDisplay from './ErrorDisplay';

interface MessageInputProps {
  platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';
  streamer: string;
  twitchChannel?: string;
  videoId?: string;
  token: string;
  onSendSuccess?: () => void;
  onAuthError?: () => void;
}

const API_BASE = API_BASE_URL;
const MAX_MESSAGE_LENGTH = 500;

export default function MessageInput({
  platform,
  streamer,
  twitchChannel,
  videoId,
  token,
  onSendSuccess,
  onAuthError
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autocomplete state
  const [emotes, setEmotes] = useState<EmoteData[]>([]);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<EmoteData[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clean up success timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  // Fetch emotes from all providers on mount (7TV/BTTV/FFZ are Twitch-only)
  useEffect(() => {
    if (!twitchChannel) {
      console.log('[AllChat Autocomplete] No Twitch channel available, skipping emote fetch');
      return;
    }

    const loadEmotes = async () => {
      try {
        const fetchedEmotes = await fetchAllEmotes(twitchChannel);
        setEmotes(fetchedEmotes);
        console.log(`[AllChat Autocomplete] Loaded ${fetchedEmotes.length} emotes for Twitch channel ${twitchChannel}`);
      } catch (err) {
        console.error('[AllChat Autocomplete] Failed to load emotes:', err);
      }
    };

    loadEmotes();
  }, [twitchChannel]);

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
      setError({
        type: ChatErrorType.VALIDATION_ERROR,
        message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`,
        userMessage: `Your message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`,
        actionableSteps: [`Shorten your message to ${MAX_MESSAGE_LENGTH} characters or less`],
        field: 'message',
        constraint: `max_length_${MAX_MESSAGE_LENGTH}`,
      });
      return;
    }

    setSending(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const requestBody: SendMessageRequest = {
        streamer_username: streamer,
        message: trimmed,
        platform,
        ...(videoId ? { video_id: videoId } : {}),
      };

      const response = await fetch(`${API_BASE}/api/v1/auth/viewer/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
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

      // Handle error responses using smart error parser
      if (!response.ok) {
        const parsedError = parseApiError(response, data);

        // Trigger auth error callback for authentication errors
        if (parsedError.type === 'UNAUTHORIZED' || parsedError.type === 'TOKEN_EXPIRED') {
          onAuthError?.();
        }

        setError(parsedError);
        return;
      }

      // Success!
      setMessage('');
      setError(null);
      onSendSuccess?.();

      // Show inline success feedback
      setSentSuccess(true);
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = setTimeout(() => {
        setSentSuccess(false);
        successTimerRef.current = null;
      }, 1000);

      // Restore focus to input field after sending
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } catch (err) {
      console.error('[AllChat MessageInput] Error sending message:', err);
      const parsedError = parseFetchError(err);
      setError(parsedError);
    } finally {
      clearTimeout(timeoutId);
      setSending(false);
    }
  };

  // Check if currently rate limited based on error
  const isRateLimited = error?.type === 'RATE_LIMITED';

  return (
    <div className="border-t border-border bg-surface p-3 relative">
      {error && (
        <ErrorDisplay
          error={error}
          onRetry={() => {
            // Clear error and allow retry
            setError(null);
          }}
          onDismiss={() => setError(null)}
          className="mb-2"
        />
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRateLimited ? 'Rate limited - see error above' : 'Send a message...'}
            disabled={sending || isRateLimited}
            maxLength={MAX_MESSAGE_LENGTH}
            className={`w-full px-3 py-2 bg-bg border rounded text-sm text-text placeholder-[var(--color-text-dim)] focus:outline-hidden focus:border-[var(--color-text-dim)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300 ${sentSuccess ? 'border-green-500 pr-8' : 'border-border'}`}
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
          {sentSuccess && (
            <svg
              className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500 animate-fade-out pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <button
          type="submit"
          disabled={!message.trim() || sending || isRateLimited}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-surface-2 disabled:cursor-not-allowed text-text font-semibold rounded text-sm transition-colors"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>

      <div className="mt-1 text-xs text-[var(--color-text-dim)] text-right">
        {message.length}/{MAX_MESSAGE_LENGTH}
      </div>
    </div>
  );
}
