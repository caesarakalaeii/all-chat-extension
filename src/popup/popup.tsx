/**
 * This file is part of All-Chat Extension.
 * Copyright (C) 2026 caesarakalaeii
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Extension Popup UI
 *
 * Shows per-platform enable toggles, viewer identity (if logged in), and name color picker.
 */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { getSyncStorage, setSyncStorage, getLocalStorage, setLocalStorage } from '../lib/storage';
import { ViewerInfo, PlatformEnabled } from '../lib/types/extension';
import { resolveEnv } from '../lib/compat';

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
  const [nameGradientRaw, setNameGradientRaw] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'' | 'saving' | 'saved'>('');
  const [currentPlatform, setCurrentPlatform] = useState<string | null>(null);
  const colorSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [envNotice, setEnvNotice] = useState<Awaited<ReturnType<typeof resolveEnv>>>(null);

  useEffect(() => {
    resolveEnv().then((cfg) => {
      if (cfg) setEnvNotice(cfg);
    });
  }, []);

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
        setNameGradientRaw(local.viewer_name_gradient ?? null);
        setCurrentPlatform(sessionData.current_platform ?? null);

        // Fetch latest cosmetics from backend (gradient may have been set on web app)
        if (local.viewer_jwt_token) {
          chrome.runtime.sendMessage({ type: 'GET_COSMETICS' }).then((resp: any) => {
            if (resp?.success && resp.data) {
              if (resp.data.name_gradient) {
                setNameGradientRaw(JSON.stringify(resp.data.name_gradient));
              }
              if (resp.data.name_color) {
                setNameColor(resp.data.name_color);
              }
            }
          }).catch(() => {});
        }
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
    // All providers go through the backend tab-based OAuth flow so we never need
    // to manage extension redirect URIs or register them with each OAuth provider.
    // The service worker opens a tab, monitors for allch.at/chat/auth-success, and
    // broadcasts AUTH_COMPLETE when the token is stored.
    try {
      await chrome.runtime.sendMessage({ type: 'OPEN_AUTH_TAB', platform });

      await new Promise<void>((resolve, reject) => {
        const listener = (msg: any) => {
          if (msg.type !== 'AUTH_COMPLETE') return;
          chrome.runtime.onMessage.removeListener(listener);
          if (msg.success) resolve();
          else reject(new Error(msg.error || 'Authentication failed'));
        };
        chrome.runtime.onMessage.addListener(listener);

        // Timeout after 5 minutes
        setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener);
          reject(new Error('Login timed out'));
        }, 300_000);
      });

      // Reload viewer info from storage (service worker already stored it)
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
    if (platform === 'youtubeStudio') return (
      <span className="platform-icon" style={{ display: 'inline-block' }} />
    );
    if (platform === 'youtube') return (
      <svg className="platform-icon" viewBox="0 0 24 24" fill="#fff"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
    );
    if (platform === 'kick') return (
      <svg className="platform-icon" viewBox="0 0 24 24"><text x="12" y="18" fontSize="18" fontWeight="bold" fill="#53FC18" textAnchor="middle" fontFamily="monospace">K</text></svg>
    );
    return null;
  };

  if (envNotice) {
    return (
      <div>
        <div style={{ background: '#7f1d1d', borderBottom: '1px solid #b91c1c', padding: '12px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: '#fecaca', margin: '0 0 6px' }}>{envNotice.label}</p>
          <a
            href={envNotice.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '13px', color: '#fff', fontWeight: 600, textDecoration: 'underline' }}
          >
            {envNotice.href}
          </a>
        </div>
        <div style={{ padding: '16px', textAlign: 'center', color: '#adadb8', fontSize: '12px' }}>
          <p>{envNotice.detail}</p>
          <p style={{ marginTop: '4px' }}>{envNotice.action}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>All-Chat Extension</h1>

      <div className="status">
        <div className="status-label">Platform Settings</div>
        {(['twitch', 'youtube', 'youtubeStudio', 'kick'] as const).map((p) => (
          <div key={p} className={`platform-row ${currentPlatform === p ? 'platform-row--active' : ''}`} data-platform={p}>
            <span className="platform-name">{platformLabel[p]}</span>
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
              <div className="status-value" style={{ marginBottom: '4px' }}>
                {viewerInfo.display_name}
                <span style={{ fontSize: '11px', color: '#adadb8', marginLeft: '6px' }}>
                  via {platformLabel[viewerInfo.platform] ?? viewerInfo.platform}
                </span>
              </div>
              {viewerInfo.connected_platforms && viewerInfo.connected_platforms.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '11px', color: '#adadb8' }}>
                  <span>Connected:</span>
                  {viewerInfo.connected_platforms.map((p) => (
                    <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 6px', background: '#26262c', borderRadius: '4px', fontSize: '11px' }}>
                      <PlatformIcon platform={p} />
                      {platformLabel[p] ?? p}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', color: '#adadb8' }}>Name Color</label>
                {(() => {
                  let gradient: { colors: string[]; angle: number } | null = null;
                  if (nameGradientRaw) {
                    try { gradient = JSON.parse(nameGradientRaw); } catch {}
                  }
                  if (gradient && gradient.colors?.length >= 2) {
                    return (
                      <div
                        title="Gradient set via allch.at settings"
                        style={{
                          width: '32px',
                          height: '24px',
                          borderRadius: '4px',
                          background: `linear-gradient(${gradient.angle ?? 90}deg, ${gradient.colors.join(', ')})`,
                          border: '1px solid #3a3a3d',
                        }}
                      />
                    );
                  }
                  return (
                    <input
                      type="color"
                      value={nameColor}
                      onChange={(e) => handleColorChange(e.target.value)}
                      style={{ width: '32px', height: '24px', cursor: 'pointer', border: 'none', padding: 0, background: 'none' }}
                    />
                  );
                })()}
                {!nameGradientRaw && (
                  <button
                    onClick={handleColorReset}
                    title="Reset to default"
                    style={{ fontSize: '11px', color: '#adadb8', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                  >
                    &#x21BA;
                  </button>
                )}
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
