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
  const [error, setError] = useState<ChatError | null>(null);
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
      
      // Restore focus to input field after sending
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } catch (err) {
      console.error('[AllChat MessageInput] Error sending message:', err);
      const parsedError = parseFetchError(err);
      setError(parsedError);
    } finally {
      setSending(false);
    }
  };

  // Check if currently rate limited based on error
  const isRateLimited = error?.type === 'RATE_LIMITED';

  return (
    <div className="border-t border-gray-700 bg-gray-800 p-3 relative">
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
