/**
 * Chat UI Entry Point
 *
 * React app that renders the chat interface inside the iframe
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import ChatContainer from './components/ChatContainer';
import './styles.css';

// Wait for initialization message from parent window
window.addEventListener('message', (event) => {
  if (event.data.type === 'ALLCHAT_INIT') {
    const { platform, streamer } = event.data;

    console.log('[AllChat UI] Initializing with:', { platform, streamer });

    const root = ReactDOM.createRoot(document.getElementById('root')!);
    root.render(
      <React.StrictMode>
        <ChatContainer platform={platform} streamer={streamer} />
      </React.StrictMode>
    );
  }
});

console.log('[AllChat UI] Waiting for initialization...');
