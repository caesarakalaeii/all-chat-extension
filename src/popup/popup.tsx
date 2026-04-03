/**
 * Extension Popup UI
 *
 * Shows per-platform enable toggles, viewer identity (if logged in), and name color picker.
 */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { getSyncStorage, setSyncStorage, getLocalStorage, setLocalStorage } from '../lib/storage';
import { ViewerInfo, PlatformEnabled } from '../lib/types/extension';

const PLATFORM_URLS: Record<string, string[]> = {
  twitch: ['https://www.twitch.tv/*'],
  youtube: ['https://www.youtube.com/*'],
  youtubeStudio: ['https://studio.youtube.com/*'],
  kick: ['https://kick.com/*'],
};

function Popup() {
  const [platformEnabled, setPlatformEnabled] = useState<PlatformEnabled>({
    twitch: true,
    youtube: true,
    youtubeStudio: true,
    kick: true,
  });
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
        setPlatformEnabled(settings.platformEnabled);
        setViewerInfo(local.viewer_info || null);
        setNameColor(local.viewer_name_color || '#ffffff');
        setCurrentPlatform(sessionData.current_platform ?? null);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handlePlatformToggle = async (platform: keyof PlatformEnabled) => {
    const newState: PlatformEnabled = { ...platformEnabled, [platform]: !platformEnabled[platform] };
    setPlatformEnabled(newState);
    try {
      await setSyncStorage({ platformEnabled: newState });
      // Send EXTENSION_STATE_CHANGED to only affected platform's tabs (per D-04 — no reload)
      const tabs = await chrome.tabs.query({ url: PLATFORM_URLS[platform] });
      await Promise.allSettled(
        tabs.filter(t => t.id).map(t =>
          chrome.tabs.sendMessage(t.id!, {
            type: 'EXTENSION_STATE_CHANGED',
            enabled: newState[platform],
          }).catch(() => {})
        )
      );
      // Update icon for affected tabs
      const iconPath = newState[platform]
        ? { 16: 'assets/icon-16.png', 32: 'assets/icon-32.png' }
        : { 16: 'assets/icon-16-gray.png', 32: 'assets/icon-32-gray.png' };
      await Promise.allSettled(
        tabs.filter(t => t.id).map(t =>
          chrome.action.setIcon({ tabId: t.id!, path: iconPath })
        )
      );
    } catch (err) {
      console.error('Failed to save platform toggle:', err);
      setPlatformEnabled(platformEnabled); // revert on error
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

  const handleSignIn = async (platform: 'twitch' | 'youtube' | 'kick' | 'youtubeStudio') => {
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

  const platformLabel: Record<string, string> = { twitch: 'Twitch', youtube: 'YouTube', youtubeStudio: 'YT Studio', kick: 'Kick' };

  const PlatformIcon = ({ platform }: { platform: string }) => {
    if (platform === 'twitch') return (
      <svg className="platform-icon" viewBox="0 0 24 24" fill="#fff"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>
    );
    if (platform === 'youtubeStudio') return null;
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
        <div className="status-label">Platform Settings</div>
        {(['twitch', 'youtube', 'youtubeStudio', 'kick'] as const).map((p) => (
          <div key={p} className={`platform-row ${currentPlatform === p ? 'platform-row--active' : ''}`} data-platform={p}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PlatformIcon platform={p} />
              <span className="platform-name">{platformLabel[p]}</span>
            </div>
            <label className="toggle-switch" aria-label={`Enable AllChat on ${platformLabel[p]}`}>
              <input
                type="checkbox"
                checked={platformEnabled[p]}
                onChange={() => handlePlatformToggle(p)}
                disabled={isLoading}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        ))}
        {Object.values(platformEnabled).some(v => !v) && (
          <p style={{ fontSize: '11px', color: '#adadb8', marginTop: '8px' }}>
            Native chat shown on disabled platforms.
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
