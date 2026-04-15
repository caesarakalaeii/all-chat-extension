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
 * Kick Content Script
 *
 * Handles All-Chat injection on Kick.com
 * URL format: kick.com/<username>
 *
 * Strategy: Full-panel toggle with tab bar.
 * A tab bar lets users switch between AllChat and native Kick chat.
 * When AllChat is active, all native Kick children are hidden.
 * When Kick Chat is active, AllChat is hidden and full native UI is restored.
 */

import { PlatformDetector } from './base/PlatformDetector';
import { createTabBar, setupTabSwitching, switchToNativeTab, switchToAllChatTab as switchToAllChatTabVisual, updateTabBarConnDot, removeTabBar, isLightMode, watchThemeChanges } from './base/tabBar';
import { getSyncStorage } from '../lib/storage';

// Guard observer — watches for Next.js removing our injected elements
let guardObserver: MutationObserver | null = null;

/**
 * Activate the Kick Chat tab: hide AllChat, show native Kick chat.
 */
function handleSwitchToKick(): void {
  const container = document.getElementById('allchat-container');
  if (container) container.style.display = 'none';
  document.getElementById('allchat-hide-native-style')?.remove();
  switchToNativeTab();
  console.log('[AllChat Kick] Switched to Kick Chat tab');
}

/**
 * Activate the AllChat tab: show AllChat, hide native Kick chat.
 */
function handleSwitchToAllChat(detector: KickDetector): void {
  const container = document.getElementById('allchat-container');
  if (container) container.style.display = 'flex';
  detector.hideNativeChat();
  switchToAllChatTabVisual();
  console.log('[AllChat Kick] Switched to AllChat tab');
}

class KickDetector extends PlatformDetector {
  platform = 'kick' as const;

  /**
   * Check if the current page is a live stream via Kick API.
   * DOM-based live badge detection is not reliable on Kick (no stable selector as of 2026-03-12).
   */
  async isLiveStream(): Promise<boolean> {
    const slug = this.extractStreamerUsername();
    if (!slug) {
      console.warn('[AllChat Kick] No channel slug found, not injecting');
      return false;
    }

    try {
      const response = await fetch(`https://kick.com/api/v2/channels/${slug}`, {
        credentials: 'omit',
      });

      if (!response.ok) {
        console.warn(`[AllChat Kick] API returned ${response.status} for channel ${slug}, not injecting`);
        return false;
      }

      const data = await response.json();

      if (data.livestream !== null && data.livestream !== undefined) {
        console.log('[AllChat Kick] Live stream detected via API');
        return true;
      }

      console.log('[AllChat Kick] Channel is not live (livestream field is null)');
      return false;
    } catch (error) {
      console.warn('[AllChat Kick] API check failed, not injecting:', error);
      return false;
    }
  }

  async init(): Promise<void> {
    console.log('[AllChat Kick] Initializing...');

    const live = await this.isLiveStream();
    if (!live) {
      console.log('[AllChat Kick] Not a live stream, skipping');
      return;
    }

    return super.init();
  }

  extractStreamerUsername(): string | null {
    const match = window.location.pathname.match(/^\/([^/]+)/);
    if (!match) return null;

    const username = match[1];

    const excluded = ['home', 'categories', 'search', 'subscriptions', 'settings', 'clip', 'clips'];
    if (excluded.includes(username.toLowerCase())) {
      return null;
    }

    return username;
  }

  getChatContainerSelector(): string[] {
    return [
      '#channel-chatroom',
    ];
  }

  hideNativeChat(): void {
    if (document.getElementById('allchat-hide-native-style')) return;

    const style = document.createElement('style');
    style.id = 'allchat-hide-native-style';
    style.textContent = `
      /* Hide all native Kick chat children except AllChat elements */
      #channel-chatroom > *:not(#allchat-container):not(#allchat-tab-bar) {
        display: none !important;
      }
      /* Ensure AllChat fills the space */
      #allchat-container {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        display: flex !important;
        flex-direction: column !important;
      }
      #allchat-container iframe {
        flex: 1 1 auto !important;
        min-height: 0 !important;
      }
    `;
    document.head.appendChild(style);
    console.log('[AllChat Kick] Injected CSS to hide native chat');
  }

  showNativeChat(): void {
    const style = document.getElementById('allchat-hide-native-style');
    if (style) {
      style.remove();
      console.log('[AllChat Kick] Removed CSS, native chat restored');
    }
  }

  removeAllChatUI(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat Kick] Removed All-Chat UI');
    }
    removeTabBar();
    this.showNativeChat();
  }

  async createInjectionPoint(): Promise<HTMLElement | null> {
    try {
      const slot = await this.waitForElement('#channel-chatroom');

      // 1. Create and inject tab bar as first child
      const tabBar = createTabBar('Kick Chat', 'kick');
      slot.insertBefore(tabBar, slot.firstChild);

      // 2. Create #allchat-container
      const container = document.createElement('div');
      container.id = 'allchat-container';
      container.style.cssText = 'flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;';

      // Insert after tab bar
      tabBar.insertAdjacentElement('afterend', container);

      // 3. Hide native children — AllChat starts as active tab
      this.hideNativeChat();

      // 4. Wire tab switching
      const detector = this;
      setupTabSwitching(
        () => handleSwitchToKick(),
        () => handleSwitchToAllChat(detector),
      );

      // 4b. Watch for theme changes and update iframe
      watchThemeChanges('kick', (theme) => {
        const iframe = document.querySelector('#allchat-container iframe') as HTMLIFrameElement | null;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'TAB_BAR_MODE', enabled: true, hideInput: false, theme }, '*');
        }
      });

      // 5. Guard against Next.js re-renders removing our elements
      guardObserver?.disconnect();
      guardObserver = new MutationObserver(() => {
        if (!slot.contains(container) && document.contains(slot)) {
          console.log('[AllChat Kick] Container removed by Next.js — re-injecting');
          const bar = document.getElementById('allchat-tab-bar');
          if (bar) {
            bar.insertAdjacentElement('afterend', container);
          } else {
            slot.insertBefore(container, slot.firstChild);
          }
        }
        if (!slot.contains(tabBar) && document.contains(slot)) {
          console.log('[AllChat Kick] Tab bar removed by Next.js — re-injecting');
          slot.insertBefore(tabBar, slot.firstChild);
        }
      });
      guardObserver.observe(slot, { childList: true });

      return container;
    } catch {
      console.warn('[AllChat Kick] #channel-chatroom not found — native chat remains visible');
      return null;
    }
  }

  protected onIframeCreated(iframe: HTMLIFrameElement): void {
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.postMessage({ type: 'TAB_BAR_MODE', enabled: true, hideInput: false, theme: isLightMode('kick') ? 'light' : 'dark' }, '*');
      console.log('[AllChat Kick] Sent TAB_BAR_MODE to iframe');
    });
  }

  teardown(): void {
    removeTabBar();
    guardObserver?.disconnect();
    guardObserver = null;
    this.showNativeChat();
    super.teardown();
  }
}

// Store detector instance globally
let globalDetector: KickDetector | null = null;

// Guard against duplicate message relay registration
let messageRelaySetup = false;

function handleExtensionStateChange(enabled: boolean) {
  console.log(`[AllChat Kick] Extension state changed: ${enabled ? 'enabled' : 'disabled'}`);

  if (!enabled) {
    if (globalDetector) {
      globalDetector.teardown();
      globalDetector = null;
    }
  } else {
    if (!globalDetector) {
      globalDetector = new KickDetector();
      setupGlobalMessageRelay();
      globalDetector.init();
      setupUrlWatcher();
    }
  }
}

async function initialize() {
  console.log('[AllChat Kick] Content script loaded');

  const settings = await getSyncStorage();
  if (!settings.platformEnabled.kick) {
    console.log('[AllChat Kick] Extension disabled for Kick, not injecting');
    setupGlobalMessageRelay();
    return;
  }

  globalDetector = new KickDetector();

  chrome.runtime.sendMessage({ type: 'SET_CURRENT_PLATFORM', platform: 'kick' }).catch((err: unknown) => {
    console.warn('[AllChat Kick] Failed to write current_platform to session:', err);
  });

  setupGlobalMessageRelay();
  globalDetector.init();
  setupUrlWatcher();
}

function setupGlobalMessageRelay() {
  if (messageRelaySetup) return;
  messageRelaySetup = true;

  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    console.log('[AllChat Kick] Received from service worker:', message.type);

    if (message.type === 'EXTENSION_STATE_CHANGED') {
      handleExtensionStateChange(message.enabled);
      return false;
    }

    if (message.type === 'CONNECTION_STATE' || message.type === 'WS_MESSAGE') {
      const iframes = document.querySelectorAll('iframe[data-platform="kick"][data-streamer]');

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

      if (message.type === 'CONNECTION_STATE' && message.data?.state) {
        updateTabBarConnDot(message.data.state);
      }
    }
    return false;
  });

  window.addEventListener('message', async (event) => {
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);

    if (event.data.type === 'GET_CONNECTION_STATE') {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATE' });
      if (response.success && event.source) {
        (event.source as Window).postMessage({
          type: 'CONNECTION_STATE',
          data: response.data
        }, extensionOrigin);
      }
    }

    if (event.data.type === 'OPEN_VIEWER_CARD' && event.data.username) {
      window.open(`https://kick.com/${event.data.username}`, '_blank');
    }

    if (event.origin !== extensionOrigin) return;

    if (event.data.type === 'POPOUT_REQUEST' && globalDetector) {
      globalDetector.handlePopoutRequest(event.data);
    }

    if (event.data.type === 'SWITCH_TO_NATIVE' && globalDetector) {
      handleSwitchToKick();
    }

    if (event.data.type === 'SWITCH_TO_ALLCHAT' && globalDetector) {
      handleSwitchToAllChat(globalDetector);
    }

    if (event.data.type === 'CLOSE_POPOUT' && globalDetector) {
      globalDetector.closePopout();
      const iframes = document.querySelectorAll('iframe[data-platform="kick"]');
      iframes.forEach((iframe) => {
        const el = iframe as HTMLIFrameElement;
        if (el.contentWindow) {
          el.contentWindow.postMessage({ type: 'POPOUT_CLOSED' }, extensionOrigin);
        }
      });
    }
  });

  console.log('[AllChat Kick] Global message relay set up');
}

function setupUrlWatcher(): void {
  let activeUrl = location.href;

  const handleNavigation = async () => {
    const url = location.href;
    if (url === activeUrl) return;
    activeUrl = url;

    console.log('[AllChat Kick] Navigation detected, tearing down...');
    globalDetector?.teardown();

    if (globalDetector) {
      const live = await globalDetector.isLiveStream();
      if (live) {
        globalDetector.init();
      }
    }
  };

  window.addEventListener('popstate', handleNavigation);

  new MutationObserver(handleNavigation).observe(
    document.querySelector('title') || document.head,
    { childList: true, characterData: true, subtree: true }
  );
}

initialize();
