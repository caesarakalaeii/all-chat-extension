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
 * YouTube Content Script
 *
 * Handles All-Chat injection on YouTube.com
 * URL formats: youtube.com/watch?v=..., youtube.com/live/..., youtube.com/@username
 *
 * Strategy: Full-panel toggle with tab bar.
 * A tab bar lets users switch between AllChat and native YouTube chat.
 * YouTube's chat is inside a cross-origin iframe (ytd-live-chat-frame),
 * so we toggle the entire element rather than targeting individual children.
 */

import { PlatformDetector } from './base/PlatformDetector';
import { createTabBar, setupTabSwitching, switchToNativeTab, switchToAllChatTab as switchToAllChatTabVisual, updateTabBarConnDot, removeTabBar, isLightMode, watchThemeChanges } from './base/tabBar';
import { getSyncStorage } from '../lib/storage';

// Guard observer — watches for YouTube removing our injected elements
let guardObserver: MutationObserver | null = null;

/**
 * Activate the YouTube Chat tab: hide AllChat, show native YouTube chat.
 */
function handleSwitchToYouTube(): void {
  const container = document.getElementById('allchat-container');
  if (container) container.style.display = 'none';
  document.getElementById('allchat-hide-native-style')?.remove();
  switchToNativeTab();
  console.log('[AllChat YouTube] Switched to YouTube Chat tab');
}

/**
 * Activate the AllChat tab: show AllChat, hide native YouTube chat.
 */
function handleSwitchToAllChat(detector: YouTubeDetector): void {
  const container = document.getElementById('allchat-container');
  if (container) container.style.display = 'flex';
  detector.hideNativeChat();
  switchToAllChatTabVisual();
  console.log('[AllChat YouTube] Switched to AllChat tab');
}

class YouTubeDetector extends PlatformDetector {
  platform = 'youtube' as const;

  /**
   * Check if the current page is a live stream.
   * Returns true only for active live streams, not VODs.
   */
  isLiveStream(): boolean {
    const liveChatFrame = document.querySelector('ytd-live-chat-frame');
    if (liveChatFrame) {
      console.log('[AllChat YouTube] Live chat frame detected');
      return true;
    }

    if (window.location.pathname.includes('/live/')) {
      console.log('[AllChat YouTube] /live/ URL detected');
      return true;
    }

    const liveBadge = document.querySelector('.ytp-live-badge, .badge-style-type-live-now');
    if (liveBadge) {
      console.log('[AllChat YouTube] Live badge detected');
      return true;
    }

    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      const playerScript = scripts.find(s => s.textContent?.includes('ytInitialPlayerResponse'));
      if (playerScript && playerScript.textContent) {
        const match = playerScript.textContent.match(/["']isLiveContent["']\s*:\s*true/);
        if (match) {
          console.log('[AllChat YouTube] isLiveContent=true detected');
          return true;
        }
      }
    } catch (error) {
      console.log('[AllChat YouTube] Could not parse player response');
    }

    console.log('[AllChat YouTube] Not a live stream');
    return false;
  }

  extractStreamerUsername(): string | null {
    const urlMatch = window.location.pathname.match(/@([^\/]+)/);
    if (urlMatch) return urlMatch[1];

    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      const dataScript = scripts.find(s => s.textContent?.includes('"channelId"'));
      if (dataScript && dataScript.textContent) {
        const match = dataScript.textContent.match(/"channelId":"(UC[^"]+)"/);
        if (match) return match[1];
      }
    } catch { /* ignore */ }

    const channelLink = document.querySelector('link[itemprop="url"]');
    if (channelLink) {
      const href = channelLink.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
    }

    const channelNameElement = document.querySelector('ytd-channel-name a');
    if (channelNameElement) {
      const href = channelNameElement.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
      const idMatch = href?.match(/\/channel\/(UC[^\/]+)/);
      if (idMatch) return idMatch[1];
    }

    const ownerLink = document.querySelector('a.yt-simple-endpoint.ytd-video-owner-renderer');
    if (ownerLink) {
      const href = ownerLink.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
      const idMatch = href?.match(/\/channel\/(UC[^\/]+)/);
      if (idMatch) return idMatch[1];
    }

    return null;
  }

  extractDisplayName(fallback: string): string {
    const channelNameEl = document.querySelector('ytd-channel-name #text, ytd-channel-name a');
    if (channelNameEl?.textContent?.trim()) {
      return channelNameEl.textContent.trim();
    }
    return fallback;
  }

  private getUnsupportedStreamReason(): string | null {
    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      const playerScript = scripts.find(s => s.textContent?.includes('ytInitialPlayerResponse'));
      if (!playerScript?.textContent) return null;

      if (/["']isUpcoming["']\s*:\s*true/.test(playerScript.textContent)) {
        return 'scheduled';
      }
      if (/["']isUnlisted["']\s*:\s*true/.test(playerScript.textContent)) {
        return 'unlisted';
      }
    } catch {
      // Can't parse — assume OK
    }
    return null;
  }

  private showUnsupportedStreamBadge(reason: 'scheduled' | 'unlisted'): void {
    const existingBadge = document.getElementById('allchat-unsupported-badge');
    if (existingBadge) existingBadge.remove();

    const messages: Record<string, string> = {
      scheduled: 'AllChat only works on live streams, not scheduled ones. Come back when the stream is live!',
      unlisted: 'AllChat doesn\'t support unlisted streams. Only public live streams are supported.',
    };

    const badge = document.createElement('div');
    badge.id = 'allchat-unsupported-badge';
    badge.style.cssText = `
      position: fixed; bottom: 10px; right: 10px; padding: 10px 14px;
      background: #1f1f23; border: 1px solid #f59e0b; border-radius: 6px;
      color: #fbbf24; font-size: 12px; z-index: 9999; max-width: 280px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      cursor: pointer; line-height: 1.4;
    `;
    badge.textContent = messages[reason];
    badge.title = 'Click to dismiss';
    badge.addEventListener('click', () => badge.remove());
    setTimeout(() => badge.remove(), 15000);

    document.body.appendChild(badge);
  }

  async init(): Promise<void> {
    console.log(`[AllChat ${this.platform}] Initializing...`);

    if (!this.isLiveStream()) {
      console.log(`[AllChat ${this.platform}] Not a live stream, skipping`);
      return;
    }

    const unsupportedReason = this.getUnsupportedStreamReason();
    if (unsupportedReason) {
      console.log(`[AllChat ${this.platform}] Stream is ${unsupportedReason}, not supported`);
      this.showUnsupportedStreamBadge(unsupportedReason as 'scheduled' | 'unlisted');
      return;
    }

    return super.init(this.extractDisplayName.bind(this));
  }

  private extractVideoId(): string | null {
    const vParam = new URLSearchParams(window.location.search).get('v');
    if (vParam) return vParam;

    const liveMatch = window.location.pathname.match(/\/live\/([^/?]+)/);
    if (liveMatch) return liveMatch[1];

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const href = canonical.getAttribute('href');
      const match = href?.match(/\/watch\?v=([^&]+)/);
      if (match) return match[1];
    }

    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        if (s.textContent?.includes('ytInitialPlayerResponse')) {
          const match = s.textContent.match(/"videoId":"([^"]{11})"/);
          if (match) return match[1];
          break;
        }
      }
    } catch { /* ignore */ }

    return null;
  }

  protected override getExtraIframeParams(): Record<string, string> {
    const videoId = this.extractVideoId();
    return videoId ? { video_id: videoId } : {};
  }

  getChatContainerSelector(): string[] {
    return [
      'ytd-live-chat-frame',
      '#chat-container',
      '#chat',
      '[id="chat"]',
      '.yt-live-chat-app',
    ];
  }

  hideNativeChat(): void {
    if (document.getElementById('allchat-hide-native-style')) return;

    // Capture the parent's current height before hiding, so it doesn't collapse.
    // YouTube sizes #chat-container based on ytd-live-chat-frame — without this
    // the container shrinks to ~0px when the chat frame is removed from flow.
    const chatFrame = document.querySelector('ytd-live-chat-frame');
    const parent = chatFrame?.parentElement;
    if (parent) {
      const currentHeight = parent.getBoundingClientRect().height;
      if (currentHeight > 100) {
        parent.style.minHeight = currentHeight + 'px';
      }
    }

    const style = document.createElement('style');
    style.id = 'allchat-hide-native-style';
    style.textContent = `
      /* Hide native YouTube chat — use visibility+position instead of display:none
         so YouTube's layout engine doesn't recalculate and collapse the parent */
      ytd-live-chat-frame {
        visibility: hidden !important;
        position: absolute !important;
        width: 0 !important;
        height: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
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
    console.log('[AllChat YouTube] Injected CSS to hide native chat');
  }

  showNativeChat(): void {
    // Clear the forced min-height we set when hiding
    const chatFrame = document.querySelector('ytd-live-chat-frame');
    const parent = chatFrame?.parentElement;
    if (parent) {
      parent.style.minHeight = '';
    }
    const style = document.getElementById('allchat-hide-native-style');
    if (style) {
      style.remove();
      console.log('[AllChat YouTube] Removed CSS, native chat restored');
    }
  }

  removeAllChatUI(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat YouTube] Removed All-Chat UI');
    }
    removeTabBar();
    this.showNativeChat();
  }

  async createInjectionPoint(): Promise<HTMLElement | null> {
    try {
      const nativeChat = await this.waitForElement('ytd-live-chat-frame');

      const watchFlexy = document.querySelector('ytd-watch-flexy');
      const isTheaterMode = watchFlexy?.hasAttribute('theater') ?? false;

      if (isTheaterMode) {
        // In theater mode, #chat-container collapses. Use a fixed overlay with tab bar.
        const wrapper = document.createElement('div');
        wrapper.id = 'allchat-theater-wrapper';
        wrapper.style.cssText = 'position: fixed; top: 0; right: 0; width: 340px; height: 100vh; z-index: 9999; display: flex; flex-direction: column;';

        const tabBar = createTabBar('YouTube Chat', 'youtube');
        wrapper.appendChild(tabBar);

        const container = document.createElement('div');
        container.id = 'allchat-container';
        container.style.cssText = 'flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;';
        wrapper.appendChild(container);

        document.body.appendChild(wrapper);

        // Wire tab switching — native tab disabled in theater mode
        const nativeTab = document.getElementById('allchat-tab-native');
        if (nativeTab) {
          nativeTab.style.opacity = '0.4';
          nativeTab.style.cursor = 'not-allowed';
          nativeTab.title = 'Exit theater mode to view YouTube Chat';
        }

        console.log('[AllChat YouTube] Injected in theater-mode (fixed overlay with tab bar)');
        return container;
      }

      // Normal mode: inject tab bar and container as siblings of ytd-live-chat-frame
      const parent = nativeChat.parentElement;
      if (!parent) {
        console.warn('[AllChat YouTube] ytd-live-chat-frame has no parent');
        return null;
      }

      // Make parent a flex column so tab bar + content share the space
      parent.style.cssText += '; display: flex !important; flex-direction: column !important;';

      // Tab bar first
      const tabBar = createTabBar('YouTube Chat', 'youtube');
      parent.insertBefore(tabBar, parent.firstChild);

      // AllChat container after tab bar, before native chat
      const container = document.createElement('div');
      container.id = 'allchat-container';
      container.style.cssText = 'flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;';
      parent.insertBefore(container, nativeChat);

      // Ensure ytd-live-chat-frame participates in flex layout
      nativeChat.style.cssText += '; flex: 1 1 auto; min-height: 0;';

      // Hide native chat — AllChat starts as active tab
      this.hideNativeChat();

      // Wire tab switching
      const detector = this;
      setupTabSwitching(
        () => handleSwitchToYouTube(),
        () => handleSwitchToAllChat(detector),
      );

      // Watch for theme changes and update iframe
      watchThemeChanges('youtube', (theme) => {
        const iframe = document.querySelector('#allchat-container iframe') as HTMLIFrameElement | null;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'TAB_BAR_MODE', enabled: true, hideInput: false, theme }, '*');
        }
      });

      // Guard against YouTube removing our elements
      guardObserver?.disconnect();
      guardObserver = new MutationObserver(() => {
        if (!parent.contains(container) && document.contains(parent)) {
          console.log('[AllChat YouTube] Container removed — re-injecting');
          parent.insertBefore(container, nativeChat);
        }
        if (!parent.contains(tabBar) && document.contains(parent)) {
          console.log('[AllChat YouTube] Tab bar removed — re-injecting');
          parent.insertBefore(tabBar, parent.firstChild);
        }
      });
      guardObserver.observe(parent, { childList: true });

      console.log('[AllChat YouTube] Injected with tab bar (flex column)');
      return container;
    } catch {
      console.warn('[AllChat YouTube] ytd-live-chat-frame not found — native chat remains visible');
      return null;
    }
  }

  protected onIframeCreated(iframe: HTMLIFrameElement): void {
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.postMessage({ type: 'TAB_BAR_MODE', enabled: true, hideInput: false, theme: isLightMode('youtube') ? 'light' : 'dark' }, '*');
      console.log('[AllChat YouTube] Sent TAB_BAR_MODE to iframe');
    });
  }

  teardown(): void {
    removeTabBar();
    // Clean up theater wrapper if present
    document.getElementById('allchat-theater-wrapper')?.remove();
    guardObserver?.disconnect();
    guardObserver = null;
    this.showNativeChat();
    super.teardown();
  }
}

/**
 * Inject "Switch to AllChat" button into native platform pop-out chat.
 */
function injectNativePopoutSwitchButton(platform: string, streamer: string, displayName: string) {
  if (document.getElementById('allchat-native-popout-btn')) return;

  const btn = document.createElement('div');
  btn.id = 'allchat-native-popout-btn';
  btn.style.cssText = `
    position: fixed; bottom: 16px; right: 16px; z-index: 9999;
    background: oklch(0.11 0.009 270); border: 1px solid oklch(0.22 0.008 270);
    border-radius: 6px; padding: 8px 12px; cursor: pointer;
    display: flex; align-items: center; gap: 8px;
    color: #fff; font-family: Inter, -apple-system, sans-serif; font-size: 13px;
    transition: background 150ms;
  `;
  btn.innerHTML = `
    <svg viewBox="0 0 100 60" width="24" height="14" fill="none" stroke="currentColor" stroke-width="6">
      <path d="M25 50C25 28 40 10 50 10S75 28 75 50" />
      <path d="M75 10C75 32 60 50 50 50S25 32 25 10" />
    </svg>
    <span>Switch to AllChat</span>
  `;
  btn.setAttribute('aria-label', 'Open AllChat in this window');
  btn.addEventListener('mouseenter', () => { btn.style.background = 'oklch(0.14 0.008 270)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'oklch(0.11 0.009 270)'; });
  btn.addEventListener('click', () => {
    const params = new URLSearchParams({ platform, streamer, display_name: displayName, popout: '1' });
    window.location.href = chrome.runtime.getURL(`ui/chat-container.html?${params}`);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
  } else {
    document.body.appendChild(btn);
  }
}

// Store detector instance globally
let globalDetector: YouTubeDetector | null = null;

// Guard against duplicate message relay registration
let messageRelaySetup = false;

function handleExtensionStateChange(enabled: boolean) {
  console.log(`[AllChat YouTube] Extension state changed: ${enabled ? 'enabled' : 'disabled'}`);

  if (!enabled) {
    if (globalDetector) {
      globalDetector.removeAllChatUI();
      globalDetector.showNativeChat();
      globalDetector = null;
    }
  } else {
    if (!globalDetector) {
      globalDetector = new YouTubeDetector();
      setupGlobalMessageRelay();
      globalDetector.init();
    }
  }
}

async function initialize() {
  console.log('[AllChat YouTube] Content script loaded');

  const settings = await getSyncStorage();
  if (!settings.platformEnabled.youtube) {
    console.log('[AllChat YouTube] Extension disabled for YouTube, not injecting');
    setupGlobalMessageRelay();
    return;
  }

  const isNativePopout = window.location.pathname === '/live_chat' || window.location.pathname === '/live_chat_replay';
  if (isNativePopout) {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v') || '';
    console.log(`[AllChat YouTube] Native pop-out detected for video: ${videoId}`);
    if (videoId) {
      injectNativePopoutSwitchButton('youtube', videoId, videoId);
    }
    return;
  }

  globalDetector = new YouTubeDetector();

  chrome.runtime.sendMessage({ type: 'SET_CURRENT_PLATFORM', platform: 'youtube' }).catch((err: unknown) => {
    console.warn('[AllChat YouTube] Failed to write current_platform to session:', err);
  });

  setupGlobalMessageRelay();

  await globalDetector.waitForElement('ytd-channel-name a').catch(() => null);
  globalDetector?.init();

  setupUrlWatcher();
}

function setupGlobalMessageRelay() {
  if (messageRelaySetup) return;
  messageRelaySetup = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[AllChat YouTube] Received from service worker:', message.type);

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

    if (event.data.type === 'REQUEST_LOGIN' && event.source) {
      console.log('[AllChat YouTube] iframe requested login, opening popup from page context');
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

    if (event.origin !== extensionOrigin) return;

    if (event.data.type === 'POPOUT_REQUEST' && globalDetector) {
      globalDetector.handlePopoutRequest(event.data);
    }

    if (event.data.type === 'SWITCH_TO_NATIVE' && globalDetector) {
      handleSwitchToYouTube();
    }

    if (event.data.type === 'SWITCH_TO_ALLCHAT' && globalDetector) {
      handleSwitchToAllChat(globalDetector);
    }

    if (event.data.type === 'CLOSE_POPOUT' && globalDetector) {
      globalDetector.closePopout();
      const iframes = document.querySelectorAll('iframe[data-platform="youtube"]');
      iframes.forEach((iframe) => {
        const el = iframe as HTMLIFrameElement;
        if (el.contentWindow) {
          el.contentWindow.postMessage({ type: 'POPOUT_CLOSED' }, extensionOrigin);
        }
      });
    }
  });

  console.log('[AllChat YouTube] Global message relay set up');
}

function setupUrlWatcher(): void {
  let activeUrl = location.href;

  const handleNavigation = () => {
    const url = location.href;
    if (url === activeUrl) return;
    activeUrl = url;

    console.log('[AllChat YouTube] Navigation detected, tearing down...');
    globalDetector?.teardown();

    if (globalDetector?.isLiveStream()) {
      globalDetector.init();
    }
  };

  window.addEventListener('yt-navigate-finish', handleNavigation);
  window.addEventListener('popstate', handleNavigation);
}

function setupTheaterModeWatcher(): void {
  const watchFlexy = document.querySelector('ytd-watch-flexy');
  if (!watchFlexy) return;

  let reinitTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (!globalDetector) return;
    if (reinitTimer) clearTimeout(reinitTimer);
    reinitTimer = setTimeout(() => {
      console.log('[AllChat YouTube] Theater/fullscreen mode changed, reinitialising...');
      globalDetector?.removeAllChatUI();
      globalDetector?.showNativeChat();
      globalDetector?.init();
    }, 300);
  });

  observer.observe(watchFlexy, {
    attributes: true,
    attributeFilter: ['theater', 'fullscreen'],
  });
}

initialize().then(() => {
  setupTheaterModeWatcher();
});
