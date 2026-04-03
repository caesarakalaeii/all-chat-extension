/**
 * Extension Popup UI
 *
 * Shows extension status, viewer identity (if logged in), and name color picker.
 */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { getSyncStorage, setSyncStorage, getLocalStorage, setLocalStorage } from '../lib/storage';
import { ViewerInfo } from '../lib/types/extension';

function Popup() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerInfo, setViewerInfo] = useState<ViewerInfo | null>(null);
  const [nameColor, setNameColor] = useState<string>('#ffffff');
  const [saveStatus, setSaveStatus] = useState<'' | 'saving' | 'saved'>('');
  const [currentPlatform, setCurrentPlatform] = useState<string | null>(null);
  const colorSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [settings, local, sessionData] = await Promise.all([
          getSyncStorage(),
          getLocalStorage(),
          chrome.storage.session.get(['current_platform']) as Promise<{ current_platform?: string }>,
        ]);
        const platform = sessionData.current_platform;
        // Derive global enabled state from current platform's setting (or any platform if no current platform)
        if (platform && platform in settings.platformEnabled) {
          setIsEnabled(settings.platformEnabled[platform as keyof typeof settings.platformEnabled]);
        } else {
          setIsEnabled(Object.values(settings.platformEnabled).some(Boolean));
        }
        setViewerInfo(local.viewer_info || null);
        setNameColor(local.viewer_name_color || '#ffffff');
        setCurrentPlatform(platform ?? null);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleToggle = async () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    try {
      // Toggle all platforms together (temporary until per-platform popup redesign in plan 05-03)
      const newPlatformEnabled = { twitch: newState, youtube: newState, kick: newState };
      await setSyncStorage({ platformEnabled: newPlatformEnabled });
      const affectedTabs = await chrome.tabs.query({
        url: ['https://www.twitch.tv/*', 'https://www.youtube.com/*', 'https://kick.com/*'],
      });
      await Promise.allSettled(
        affectedTabs.filter(tab => tab.id).map(tab =>
          chrome.tabs.sendMessage(tab.id!, { type: 'EXTENSION_STATE_CHANGED', enabled: newState }).catch(() => {})
        )
      );
    } catch (err) {
      console.error('Failed to save settings:', err);
      setIsEnabled(!newState);
    }
  };

  const handleColorChange = (color: string) => {
    setNameColor(color);
    setSaveStatus('saving');

    if (colorSaveTimeout.current) clearTimeout(colorSaveTimeout.current);
    colorSaveTimeout.current = setTimeout(async () => {
      try {
        await chrome.runtime.sendMessage({ type: 'SAVE_NAME_COLOR', color });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 1500);
      } catch (err) {
        console.error('Failed to save color:', err);
        setSaveStatus('');
      }
    }, 300);
  };

  const handleColorReset = async () => {
    setNameColor('#ffffff');
    setSaveStatus('saving');
    try {
      await chrome.runtime.sendMessage({ type: 'SAVE_NAME_COLOR', color: null });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 1500);
    } catch (err) {
      console.error('Failed to reset color:', err);
      setSaveStatus('');
    }
  };

  const handleLogout = async () => {
    await chrome.runtime.sendMessage({ type: 'LOGOUT' });
    setViewerInfo(null);
    setNameColor('#ffffff');
  };

  const handleSignIn = async (platform: 'twitch' | 'youtube' | 'kick') => {
    try {
      const { data } = await chrome.runtime.sendMessage({ type: 'START_AUTH', platform });
      const callbackUrl: string = await new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({ url: data.authUrl, interactive: true }, (url) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(url!);
        });
      });

      const params = new URL(callbackUrl).searchParams;
      const code = params.get('code');
      const state = params.get('state');
      if (!code || !state) throw new Error('Missing code or state');

      await chrome.runtime.sendMessage({ type: 'EXCHANGE_CODE', platform, code, state });

      // Reload viewer info
      const local = await getLocalStorage();
      setViewerInfo(local.viewer_info || null);
    } catch (err) {
      console.error('[AllChat] Sign-in error:', err);
    }
  };

  const openSettings = () => {
    chrome.tabs.create({ url: 'https://allch.at/settings/viewer' });
  };

  const platformLabel: Record<string, string> = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick' };

  const PlatformIcon = ({ platform }: { platform: string }) => {
    if (platform === 'twitch') return (
      <svg className="platform-icon" viewBox="0 0 24 24" fill="#fff"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>
    );
    if (platform === 'youtube') return (
      <svg className="platform-icon" viewBox="0 0 24 24" fill="#fff"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
    );
    if (platform === 'kick') return (
      <svg className="platform-icon" viewBox="0 0 24 24"><text x="12" y="18" fontSize="18" fontWeight="bold" fill="#53FC18" textAnchor="middle" fontFamily="monospace">K</text></svg>
    );
    return null;
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
            <input type="checkbox" checked={isEnabled} onChange={handleToggle} disabled={isLoading} />
            <span className="toggle-slider"></span>
          </label>
        </div>
        {!isEnabled && (
          <p style={{ fontSize: '11px', color: '#adadb8', marginTop: '8px' }}>
            Native chat will be shown. Re-enable to use All-Chat.
          </p>
        )}
      </div>

      {!isLoading && (
        <div className="status">
          <div className="status-label">Viewer Identity</div>
          {viewerInfo ? (
            <>
              <div className="status-value" style={{ marginBottom: '8px' }}>
                {viewerInfo.display_name}
                <span style={{ fontSize: '11px', color: '#adadb8', marginLeft: '6px' }}>
                  via {platformLabel[viewerInfo.platform] ?? viewerInfo.platform}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', color: '#adadb8' }}>Name Color</label>
                <input
                  type="color"
                  value={nameColor}
                  onChange={(e) => handleColorChange(e.target.value)}
                  style={{ width: '32px', height: '24px', cursor: 'pointer', border: 'none', padding: 0, background: 'none' }}
                />
                <button
                  onClick={handleColorReset}
                  title="Reset to default"
                  style={{ fontSize: '11px', color: '#adadb8', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                >
                  &#x21BA;
                </button>
                {saveStatus === 'saving' && <span style={{ fontSize: '11px', color: '#adadb8' }}>Saving…</span>}
                {saveStatus === 'saved' && <span style={{ fontSize: '11px', color: '#00c853' }}>Saved</span>}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn-secondary" onClick={openSettings}>Settings</button>
                <button className="btn-danger" onClick={handleLogout}>Sign out</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: '12px', color: '#adadb8', marginTop: '4px', marginBottom: '8px' }}>
                Sign in to personalize your chat identity.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {((['twitch', 'youtube', 'kick'] as const).filter(
                  (p) => currentPlatform === null || currentPlatform === p
                )).map((p) => (
                  <button key={p} className={`btn-platform btn-${p}`} onClick={() => handleSignIn(p)}>
                    <PlatformIcon platform={p} />
                    Sign in with {platformLabel[p]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="status">
        <div className="status-label">Supported Platforms</div>
        <div className="status-value">Twitch • YouTube • Kick</div>
      </div>

      <div className="footer">
        <a href="https://github.com/caesarakalaeii/all-chat" target="_blank" className="link">
          Learn more about All-Chat
        </a>
        <div style={{ marginTop: '8px' }}>Version {chrome.runtime.getManifest().version}</div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Popup />);
