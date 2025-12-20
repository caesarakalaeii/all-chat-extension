/**
 * Extension Popup UI
 *
 * Simple popup showing extension status and settings
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

function Popup() {
  return (
    <div>
      <h1>All-Chat Extension</h1>

      <div className="status">
        <div className="status-label">Status</div>
        <div className="status-value">✓ Extension Active</div>
      </div>

      <div className="status">
        <div className="status-label">Supported Platforms</div>
        <div className="status-value">
          Twitch • YouTube
        </div>
      </div>

      <div className="status">
        <div className="status-label">How it works</div>
        <p style={{ fontSize: '12px', color: '#adadb8', marginTop: '4px' }}>
          Navigate to a supported streaming platform. If the streamer uses All-Chat,
          native chat will be replaced automatically.
        </p>
      </div>

      <div className="footer">
        <a href="https://github.com/yourusername/all-chat" target="_blank" className="link">
          Learn more about All-Chat
        </a>
        <div style={{ marginTop: '8px' }}>
          Version {chrome.runtime.getManifest().version}
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Popup />);
