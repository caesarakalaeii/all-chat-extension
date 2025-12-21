/**
 * Extension Popup UI
 *
 * Simple popup showing extension status and settings
 */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { getSyncStorage, setSyncStorage } from '../lib/storage';

function Popup() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Load extension enabled state on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getSyncStorage();
        setIsEnabled(settings.extensionEnabled);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Handle toggle change
  const handleToggle = async () => {
    const newState = !isEnabled;
    setIsEnabled(newState);

    try {
      await setSyncStorage({ extensionEnabled: newState });
      
      // Notify only affected tabs to update their state
      const affectedTabs = await chrome.tabs.query({
        url: ['https://www.twitch.tv/*', 'https://www.youtube.com/*']
      });
      affectedTabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'EXTENSION_STATE_CHANGED',
            enabled: newState
          }).catch(() => {
            // Ignore errors for tabs without content script
          });
        }
      });

      // Reload affected tabs to apply changes
      affectedTabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.reload(tab.id);
        }
      });
    } catch (err) {
      console.error('Failed to save settings:', err);
      // Revert on error
      setIsEnabled(!newState);
    }
  };

  return (
    <div>
      <h1>All-Chat Extension</h1>

      <div className="status">
        <div className="status-label">Extension Status</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="status-value">
            {isLoading ? '⏳ Loading...' : isEnabled ? '✓ Enabled' : '✕ Disabled'}
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={handleToggle}
              disabled={isLoading}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        {!isEnabled && (
          <p style={{ fontSize: '11px', color: '#adadb8', marginTop: '8px' }}>
            Native chat will be shown. Re-enable to use All-Chat.
          </p>
        )}
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
        <a href="https://github.com/caesarakalaeii/all-chat" target="_blank" className="link">
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
