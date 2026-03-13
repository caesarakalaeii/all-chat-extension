/**
 * Chat UI Entry Point
 *
 * React app that renders the chat interface inside the iframe
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import ChatContainer, { Platform } from './components/ChatContainer';
import ErrorBoundary from './components/ErrorBoundary';
import './styles.css';

const manifest = chrome.runtime.getManifest();

// Read platform and streamer from URL params (set by the content script in the iframe src).
// This avoids postMessage for init — content scripts report the page origin, not the extension
// origin, so a postMessage-based init would be blocked by the KICK-05 origin check.
const params = new URLSearchParams(location.search);
const platform = params.get('platform');
const streamer = params.get('streamer');

if (platform && streamer) {
  console.log('[AllChat UI] Initializing with:', { platform, streamer });
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(
    <ErrorBoundary>
      <ChatContainer platform={platform as Platform} streamer={streamer} />
    </ErrorBoundary>
  );
} else {
  console.log(`[AllChat UI] Waiting for initialization... v${manifest.version}`);
}
