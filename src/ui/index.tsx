/**
 * Chat UI Entry Point
 *
 * React app that renders the chat interface inside the iframe
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import ChatContainer from './components/ChatContainer';
import './styles.css';

// Create root once and reuse it
let root: ReactDOM.Root | null = null;
let initialized = false;

// Wait for initialization message from parent window
window.addEventListener('message', (event) => {
  if (event.data.type === 'ALLCHAT_INIT') {
    const { platform, streamer } = event.data;

    console.log('[AllChat UI] Initializing with:', { platform, streamer });

    // Only create root once
    if (!root) {
      console.log('[AllChat UI] Creating React root');
      root = ReactDOM.createRoot(document.getElementById('root')!);
    } else {
      console.log('[AllChat UI] Reusing existing React root');
    }

    // Render (or re-render with new props)
    root.render(
      <ChatContainer platform={platform} streamer={streamer} />
    );

    initialized = true;
  }
});

console.log('[AllChat UI] Waiting for initialization...');
