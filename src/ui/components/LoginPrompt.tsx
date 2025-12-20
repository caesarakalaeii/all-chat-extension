import React, { useState } from 'react';
import { API_BASE_URL } from '../../config';

interface LoginPromptProps {
  platform: 'twitch' | 'youtube' | 'kick';
  streamer: string;
  onLogin: (token: string) => void;
}

const API_BASE = API_BASE_URL;

export default function LoginPrompt({ platform, streamer, onLogin }: LoginPromptProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get OAuth URL from API
      const loginEndpoint = `${API_BASE}/api/v1/auth/viewer/${platform}/login?streamer=${encodeURIComponent(streamer)}`;
      const response = await fetch(loginEndpoint);

      if (!response.ok) {
        throw new Error('Failed to get login URL');
      }

      const data = await response.json();
      const authURL = data.auth_url;

      if (!authURL) {
        throw new Error('No auth URL returned');
      }

      // Open OAuth flow in popup
      const popup = window.open(
        authURL,
        'AllChatOAuth',
        'width=600,height=700,left=100,top=100'
      );

      if (!popup) {
        throw new Error('Failed to open popup. Please allow popups for this site.');
      }

      // Listen for message from OAuth callback
      const handleMessage = (event: MessageEvent) => {
        // Check origin is from our frontend
        if (!event.origin.startsWith('http://localhost')) {
          return;
        }

        if (event.data.type === 'ALLCHAT_AUTH_SUCCESS' && event.data.token) {
          console.log('[AllChat Login] Received token from OAuth callback');
          window.removeEventListener('message', handleMessage);
          popup.close();
          onLogin(event.data.token);
          setLoading(false);
        } else if (event.data.type === 'ALLCHAT_AUTH_ERROR') {
          console.error('[AllChat Login] OAuth error:', event.data.error);
          window.removeEventListener('message', handleMessage);
          popup.close();
          setError(event.data.error || 'Authentication failed');
          setLoading(false);
        }
      };

      window.addEventListener('message', handleMessage);

      // Check if popup was closed without completing auth
      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed);
          window.removeEventListener('message', handleMessage);
          if (loading) {
            setLoading(false);
            setError('Authentication cancelled');
          }
        }
      }, 500);
    } catch (err) {
      console.error('[AllChat Login] Error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-4 bg-gray-800 rounded-lg">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-white mb-2">
          Login to Send Messages
        </h3>
        <p className="text-sm text-gray-400">
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
        className={`px-6 py-3 rounded font-semibold transition-colors ${
          loading
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-purple-600 hover:bg-purple-700 text-white'
        }`}
      >
        {loading ? 'Opening login...' : `Login with ${platform.charAt(0).toUpperCase() + platform.slice(1)}`}
      </button>

      <p className="text-xs text-gray-500 text-center max-w-xs">
        You'll be redirected to {platform.charAt(0).toUpperCase() + platform.slice(1)} to authorize All-Chat. Your credentials are never stored by this extension.
      </p>
    </div>
  );
}
