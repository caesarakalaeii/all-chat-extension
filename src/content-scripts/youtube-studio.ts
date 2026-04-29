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
 * YouTube Studio Content Script
 *
 * Handles All-Chat injection on studio.youtube.com
 * URL format: studio.youtube.com/video/<videoId>/livestreaming
 *
 * Studio has a completely different DOM from the viewer YouTube site.
 * The live chat panel uses an iframe at `youtube.com/live_chat?...`
 * embedded inside the Studio dashboard.
 */

import { PlatformDetector } from './base/PlatformDetector';
import { getSyncStorage } from '../lib/storage';

class YouTubeStudioDetector extends PlatformDetector {
  platform = 'youtube' as const;

  /**
   * Check if the current page is the live streaming dashboard.
   * Studio URLs: studio.youtube.com/video/<id>/livestreaming
   */
  isLiveStreamPage(): boolean {
    if (window.location.pathname.includes('/livestreaming')) {
      console.log('[AllChat YTStudio] Livestreaming page detected');
      return true;
    }

    console.log('[AllChat YTStudio] Not a livestreaming page');
    return false;
  }

  extractStreamerUsername(): string | null {
    // Method 1: From channel links in Studio header (relative paths like /channel/UC...)
    // These are always present in the Studio nav bar.
    const channelLink = document.querySelector('a[href*="/channel/"]');
    if (channelLink) {
      const href = channelLink.getAttribute('href');
      const match = href?.match(/\/channel\/(UC[^\/?"]+)/);
      if (match) return match[1];
    }

    // Method 2: Channel ID from embedded script data
    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      const dataScript = scripts.find(s => s.textContent?.includes('"channelId"'));
      if (dataScript && dataScript.textContent) {
        const match = dataScript.textContent.match(/"channelId":"(UC[^"]+)"/);
        if (match) return match[1];
      }
    } catch { /* ignore */ }

    return null;
  }

  /**
   * Extract a human-readable channel name for display.
   */
  extractDisplayName(fallback: string): string {
    // Studio header shows channel name
    const channelName = document.querySelector(
      '#channel-title, .channel-name, ytcp-account-settings .channel-name'
    );
    if (channelName?.textContent?.trim()) {
      return channelName.textContent.trim();
    }
    return fallback;
  }

  async init(): Promise<void> {
    console.log('[AllChat YTStudio] Initializing...');

    if (!this.isLiveStreamPage()) {
      console.log('[AllChat YTStudio] Not a livestreaming page, skipping');
      return;
    }

    return super.init(this.extractDisplayName.bind(this));
  }

  getChatContainerSelector(): string[] {
    // Verified against live Studio DOM (2026-03-27):
    // div#chat > ytls-live-chat-container-renderer > tp-yt-iron-collapse#chat-container
    //   > ytcp-live-chat-frame > iframe#live-chat
    return [
      '#chat-container',                        // tp-yt-iron-collapse wrapping the chat
      'ytcp-live-chat-frame',                    // Custom element around the iframe
      'iframe#live-chat',                        // The chat iframe itself
    ];
  }

  hideNativeChat(): void {
    if (document.getElementById('allchat-hide-native-style')) return;

    const style = document.createElement('style');
    style.id = 'allchat-hide-native-style';
    // Hide the ytcp-live-chat-frame (and its iframe child) while keeping
    // #chat-container visible so our injected container has dimensions.
    style.textContent = `
      ytcp-live-chat-frame {
        visibility: hidden !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
    console.log('[AllChat YTStudio] Injected CSS to hide native chat');
  }

  showNativeChat(): void {
    const style = document.getElementById('allchat-hide-native-style');
    if (style) {
      style.remove();
      console.log('[AllChat YTStudio] Removed CSS to show native chat');
    }
  }

  removeAllChatUI(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat YTStudio] Removed All-Chat UI');
    }
  }

  async createInjectionPoint(): Promise<HTMLElement | null> {
    // Verified DOM hierarchy (2026-03-27):
    // div#chat > ytls-live-chat-container-renderer > tp-yt-iron-collapse#chat-container
    //   > ytcp-live-chat-frame > iframe#live-chat
    //
    // We inject inside #chat-container alongside ytcp-live-chat-frame, then hide
    // the native frame via CSS so our container fills the same space.
    try {
      const chatContainer = await this.waitForElement('#chat-container');

      const container = document.createElement('div');
      container.id = 'allchat-container';
      container.style.cssText = 'position: absolute; inset: 0; z-index: 1;';

      if (chatContainer.style.position === '' || chatContainer.style.position === 'static') {
        chatContainer.style.position = 'relative';
      }

      const nativeFrame = chatContainer.querySelector('ytcp-live-chat-frame');
      if (nativeFrame) {
        chatContainer.insertBefore(container, nativeFrame);
      } else {
        chatContainer.appendChild(container);
      }

      return container;
    } catch {
      console.warn('[AllChat YTStudio] #chat-container not found — native chat remains visible');
      return null;
    }
  }
}

// Store detector instance globally
let globalDetector: YouTubeStudioDetector | null = null;

// Guard against duplicate message relay registration
let messageRelaySetup = false;

/**
 * Handle extension enable/disable state changes
 */
function handleExtensionStateChange(enabled: boolean) {
  console.log(`[AllChat YTStudio] Extension state changed: ${enabled ? 'enabled' : 'disabled'}`);

  if (!enabled) {
    if (globalDetector) {
      globalDetector.removeAllChatUI();
      globalDetector.showNativeChat();
      globalDetector = null;
    }
  } else {
    // Re-enable: create detector and init without page reload (per D-04)
    if (!globalDetector) {
      globalDetector = new YouTubeStudioDetector();
      setupGlobalMessageRelay(); // idempotent via guard
      globalDetector.init();
    }
  }
}

// Initialize detector
async function initialize() {
  console.log('[AllChat YTStudio] Content script loaded');

  const settings = await getSyncStorage();
  if (!settings.platformEnabled.youtubeStudio) {
    console.log('[AllChat YTStudio] Extension disabled for YouTube Studio, not injecting');
    setupGlobalMessageRelay(); // Listen for re-enable even when disabled
    return;
  }

  globalDetector = new YouTubeStudioDetector();

  chrome.runtime.sendMessage({ type: 'SET_CURRENT_PLATFORM', platform: 'youtubeStudio' }).catch((err: unknown) => {
    console.warn('[AllChat YTStudio] Failed to write current_platform to session:', err);
  });

  setupGlobalMessageRelay();

  // Wait for the Studio header channel link to render before extracting username.
  // On fresh page loads the nav isn't ready when the content script fires.
  await globalDetector.waitForElement('a[href*="/channel/"]').catch(() => null);
  globalDetector.init();

  setupUrlWatcher();
}

/**
 * Set up global message relay from service worker to iframe
 */
function setupGlobalMessageRelay() {
  if (messageRelaySetup) return;
  messageRelaySetup = true;

  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    console.log('[AllChat YTStudio] Received from service worker:', message.type);

    if (message.type === 'EXTENSION_STATE_CHANGED') {
      handleExtensionStateChange(message.enabled);
      return false;
    }

    if (message.type === 'CONNECTION_STATE' || message.type === 'WS_MESSAGE') {
      const iframes = document.querySelectorAll('iframe[data-platform="youtube"][data-streamer]');

      iframes.forEach((iframe) => {
        const iframeElement = iframe as HTMLIFrameElement;
        const iframeStreamer = iframeElement.getAttribute('data-streamer');
        if (message.streamer && iframeStreamer && message.streamer !== iframeStreamer) {
          return;
        }
        if (iframeElement.contentWindow) {
          const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
          iframeElement.contentWindow.postMessage(message, extensionOrigin);
        }
      });
    }

    if (message.type === 'POPOUT_CLOSED_REMOTE' && globalDetector) {
      globalDetector.notifyPopoutClosedExternally('iframe[data-platform="youtube"]');
    }

    return false;
  });

  window.addEventListener('message', async (event) => {
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);

    if (event.data.type === 'GET_CONNECTION_STATE') {
      console.log('[AllChat YTStudio] iframe requested connection state');
      const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATE' });
      if (response.success && event.source) {
        (event.source as Window).postMessage({
          type: 'CONNECTION_STATE',
          data: response.data
        }, extensionOrigin);
      }
    }

    if (event.data.type === 'REQUEST_LOGIN' && event.source) {
      console.log('[AllChat YTStudio] iframe requested login');
      const source = event.source as Window;
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'DO_LOGIN',
          platform: event.data.platform,
          streamerUsername: event.data.streamer,
        });
        if (!resp.success) throw new Error(resp.error);

        const popup = window.open(resp.data.loginUrl, 'AllChatOAuth', 'width=600,height=700,left=100,top=100');
        if (!popup) throw new Error('Failed to open popup');

        const handleAuthMessage = (authEvent: MessageEvent) => {
          if (authEvent.data.type === 'ALLCHAT_AUTH_SUCCESS' && authEvent.data.token) {
            window.removeEventListener('message', handleAuthMessage);
            popup.close();
            chrome.runtime.sendMessage({ type: 'STORE_VIEWER_TOKEN', token: authEvent.data.token }).then(() => {
              source.postMessage({ type: 'LOGIN_SUCCESS', token: authEvent.data.token }, extensionOrigin);
            });
          } else if (authEvent.data.type === 'ALLCHAT_AUTH_ERROR') {
            window.removeEventListener('message', handleAuthMessage);
            popup.close();
            source.postMessage({ type: 'LOGIN_ERROR', error: authEvent.data.error }, extensionOrigin);
          }
        };
        window.addEventListener('message', handleAuthMessage);
      } catch (err: any) {
        source.postMessage({ type: 'LOGIN_ERROR', error: err.message }, extensionOrigin);
      }
    }

    if (event.data.type === 'OPEN_VIEWER_CARD' && event.data.userId) {
      window.open(`https://www.youtube.com/channel/${event.data.userId}`, '_blank');
    }

    // Guard: only handle pop-out messages from the AllChat extension origin (T-06-09)
    if (event.origin !== extensionOrigin) return;

    // Handle pop-out request from AllChat iframe
    if (event.data.type === 'POPOUT_REQUEST' && globalDetector) {
      globalDetector.handlePopoutRequest(event.data);
    }

    // Handle "Switch to native" from AllChat iframe (D-14)
    if (event.data.type === 'SWITCH_TO_NATIVE' && globalDetector) {
      globalDetector.handleSwitchToNative();
    }

    // Handle "Bring back chat" / close pop-out from AllChat iframe
    if (event.data.type === 'CLOSE_POPOUT' && globalDetector) {
      globalDetector.closePopout();
      // Use generic selector since platform value may vary for YouTube Studio
      const iframes = document.querySelectorAll('iframe[data-platform]');
      iframes.forEach((iframe) => {
        const el = iframe as HTMLIFrameElement;
        if (el.contentWindow) {
          el.contentWindow.postMessage({ type: 'POPOUT_CLOSED' }, extensionOrigin);
        }
      });
    }
  });

  console.log('[AllChat YTStudio] Global message relay set up');
}

/**
 * Watch for URL changes — Studio uses SPA navigation.
 * Uses popstate + MutationObserver on title (same approach as Kick).
 */
function setupUrlWatcher(): void {
  let activeUrl = location.href;

  const handleNavigation = () => {
    const url = location.href;
    if (url === activeUrl) return;
    activeUrl = url;

    console.log('[AllChat YTStudio] Navigation detected, tearing down...');
    globalDetector?.teardown();

    if (globalDetector?.isLiveStreamPage()) {
      globalDetector.init();
    }
  };

  window.addEventListener('popstate', handleNavigation);

  new MutationObserver(handleNavigation).observe(
    document.querySelector('title') || document.head,
    { childList: true, characterData: true, subtree: true }
  );
}

// Start initialization
initialize();
