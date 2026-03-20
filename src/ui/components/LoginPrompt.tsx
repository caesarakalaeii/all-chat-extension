import React, { useState, useRef } from 'react';
import { API_BASE_URL } from '../../config';

interface LoginPromptProps {
  platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';
  streamer: string;
  onLogin: (token: string) => void;
}

const API_BASE = API_BASE_URL;

export default function LoginPrompt({ platform, streamer, onLogin }: LoginPromptProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authCompleted = useRef(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    authCompleted.current = false;

    try {
      // Delegate to service worker via parent window (content script relay)
      // This uses chrome.identity.launchWebAuthFlow which is the correct
      // extension OAuth mechanism — window.open from an iframe doesn't work reliably
      window.parent.postMessage({ type: 'REQUEST_LOGIN', platform, streamer }, '*');

      // Listen for login result relayed back from content script
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'LOGIN_SUCCESS' && event.data.token) {
          authCompleted.current = true;
          window.removeEventListener('message', handleMessage);
          onLogin(event.data.token);
          setLoading(false);
        } else if (event.data.type === 'LOGIN_ERROR') {
          authCompleted.current = true;
          window.removeEventListener('message', handleMessage);
          setError(event.data.error || 'Authentication failed');
          setLoading(false);
        }
      };

      window.addEventListener('message', handleMessage);

      // Timeout after 3 minutes
      setTimeout(() => {
        if (!authCompleted.current) {
          window.removeEventListener('message', handleMessage);
          setLoading(false);
          setError('Login timed out');
        }
      }, 180_000);
    } catch (err) {
      console.error('[AllChat Login] Error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-4 bg-surface rounded-lg">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-text mb-2">
          Login to Send Messages
        </h3>
        <p className="text-sm text-[var(--color-text-sub)]">
          Log in with your {platform.charAt(0).toUpperCase() + platform.slice(1)} account to send messages in {streamer}'s chat
        </p>
      </div>

      {error && (
        <div className="w-full p-3 bg-red-900/50 border border-red-700 rounded text-sm text-red-200">
          {error}
        </div>
      )}

      <button
        onClick={handleLogin}
        disabled={loading}
        className={`px-6 py-3 rounded font-semibold transition-opacity ${
          loading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
        }`}
        style={loading ? {} : {
          backgroundColor:
            platform === 'twitch'  ? '#9146FF' :
            platform === 'youtube' ? '#FF4444' :
            platform === 'kick'    ? '#53FC18' :
            platform === 'tiktok'  ? '#69C9D0' : '#9146FF',
          color: platform === 'kick' ? '#000' : '#fff',
        }}
      >
        {loading ? 'Opening login...' : `Login with ${platform.charAt(0).toUpperCase() + platform.slice(1)}`}
      </button>

      <p className="text-xs text-[var(--color-text-dim)] text-center max-w-xs">
        You'll be redirected to {platform.charAt(0).toUpperCase() + platform.slice(1)} to authorize All-Chat. Your credentials are never stored by this extension.
      </p>
    </div>
  );
}
