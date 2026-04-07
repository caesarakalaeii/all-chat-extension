/**
 * YouTube Content Script
 *
 * Handles All-Chat injection on YouTube.com
 * URL formats: youtube.com/watch?v=..., youtube.com/live/..., youtube.com/@username
 */

import { PlatformDetector } from './base/PlatformDetector';
import { getSyncStorage } from '../lib/storage';

class YouTubeDetector extends PlatformDetector {
  platform = 'youtube' as const;

  /**
   * Check if the current page is a live stream
   * Returns true only for active live streams, not VODs
   */
  isLiveStream(): boolean {
    // Method 1: Check for live chat frame (only present on live streams)
    const liveChatFrame = document.querySelector('ytd-live-chat-frame');
    if (liveChatFrame) {
      console.log('[AllChat YouTube] Live chat frame detected');
      return true;
    }

    // Method 2: Check URL patterns for live streams
    if (window.location.pathname.includes('/live/')) {
      console.log('[AllChat YouTube] /live/ URL detected');
      return true;
    }

    // Method 3: Check for "LIVE" badge in player
    const liveBadge = document.querySelector('.ytp-live-badge, .badge-style-type-live-now');
    if (liveBadge) {
      console.log('[AllChat YouTube] Live badge detected');
      return true;
    }

    // Method 4: Check ytInitialPlayerResponse for isLiveContent
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
    // Method 1: From URL — fast path for /@channel/live pages
    const urlMatch = window.location.pathname.match(/@([^\/]+)/);
    if (urlMatch) return urlMatch[1];

    // Method 2: From ytInitialData — tried early because it returns the channel_id
    // (UC...) which is always the primary key stored in overlay_chat_sources.
    // Handle-based methods (3-5) can return display-name strings that only match
    // if channel_handle was also populated in the DB, which is not guaranteed.
    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      const dataScript = scripts.find(s => s.textContent?.includes('"channelId"'));
      if (dataScript && dataScript.textContent) {
        const match = dataScript.textContent.match(/"channelId":"(UC[^"]+)"/);
        if (match) return match[1];
      }
    } catch { /* ignore */ }

    // Method 3: From page metadata link
    const channelLink = document.querySelector('link[itemprop="url"]');
    if (channelLink) {
      const href = channelLink.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
    }

    // Method 4: From channel link in header
    const channelNameElement = document.querySelector('ytd-channel-name a');
    if (channelNameElement) {
      const href = channelNameElement.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
      const idMatch = href?.match(/\/channel\/(UC[^\/]+)/);
      if (idMatch) return idMatch[1];
    }

    // Method 5: From owner link in video page
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

  /**
   * Extract a human-readable channel name for display in the UI.
   * Falls back to the username (channel ID or handle) if not found.
   */
  extractDisplayName(fallback: string): string {
    // From the channel name element text content
    const channelNameEl = document.querySelector('ytd-channel-name #text, ytd-channel-name a');
    if (channelNameEl?.textContent?.trim()) {
      return channelNameEl.textContent.trim();
    }
    return fallback;
  }

  /**
   * Override init to check for live streams first, and pass display name to UI
   */
  async init(): Promise<void> {
    console.log(`[AllChat ${this.platform}] Initializing...`);

    // YouTube-specific: Only activate on live streams, not VODs
    if (!this.isLiveStream()) {
      console.log(`[AllChat ${this.platform}] Not a live stream, skipping`);
      return;
    }

    // Continue with normal initialization, passing display name override
    return super.init(this.extractDisplayName.bind(this));
  }

  /**
   * Extract YouTube video ID from the current page URL.
   * Supports /watch?v=VIDEO_ID and /live/VIDEO_ID formats.
   */
  private extractVideoId(): string | null {
    // /watch?v=VIDEO_ID
    const vParam = new URLSearchParams(window.location.search).get('v');
    if (vParam) return vParam;

    // /live/VIDEO_ID
    const liveMatch = window.location.pathname.match(/\/live\/([^/?]+)/);
    if (liveMatch) return liveMatch[1];

    return null;
  }

  /**
   * Pass the YouTube video ID to the AllChat iframe so the backend can use
   * the cheap videos.list API (1 quota unit) instead of the unreliable
   * search.list API (100 quota units) to discover the liveChatId.
   */
  protected override getExtraIframeParams(): Record<string, string> {
    const videoId = this.extractVideoId();
    return videoId ? { video_id: videoId } : {};
  }

  getChatContainerSelector(): string[] {
    // Multi-level fallback selectors for YouTube live chat
    return [
      'ytd-live-chat-frame',          // Primary container
      '#chat-container',              // ID selector
      '#chat',                        // Alternative ID
      '[id="chat"]',                  // Attribute selector
      '.yt-live-chat-app',            // Class name
    ];
  }

  hideNativeChat(): void {
    if (document.getElementById('allchat-hide-native-style')) return; // idempotent

    const style = document.createElement('style');
    style.id = 'allchat-hide-native-style';
    // Use visibility:hidden + overflow:hidden instead of display:none so YouTube
    // keeps allocating height for #chat-container. display:none collapses the
    // parent to ~152px which makes our injected container unusably small.
    style.textContent = `
      ytd-live-chat-frame {
        visibility: hidden !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
    console.log('[AllChat YouTube] Injected CSS to hide native chat');
  }

  showNativeChat(): void {
    const style = document.getElementById('allchat-hide-native-style');
    if (style) {
      style.remove();
      console.log('[AllChat YouTube] Removed CSS to show native chat');
    }
  }

  removeAllChatUI(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat YouTube] Removed All-Chat UI');
    }
  }

  async createInjectionPoint(): Promise<HTMLElement | null> {
    try {
      const nativeChat = await this.waitForElement('ytd-live-chat-frame');

      const watchFlexy = document.querySelector('ytd-watch-flexy');
      const isTheaterMode = watchFlexy?.hasAttribute('theater') ?? false;

      const container = document.createElement('div');
      container.id = 'allchat-container';

      if (isTheaterMode) {
        // In theater mode #chat-container collapses to width:0 because YouTube
        // removes the right-hand sidebar. Use a fixed overlay on the right side
        // of the screen so the chat remains visible over the video.
        container.style.cssText = 'position: fixed; top: 0; right: 0; width: 340px; height: 100vh; z-index: 9999;';
        document.body.appendChild(container);
        console.log('[AllChat YouTube] Injected in theater-mode (fixed overlay)');
      } else {
        const parent = nativeChat.parentElement;
        if (!parent) {
          console.warn('[AllChat YouTube] ytd-live-chat-frame has no parent — native chat remains visible');
          return null;
        }
        // Position over the native chat frame absolutely so we fill the full
        // column height regardless of how YouTube sizes #chat-container
        container.style.cssText = 'position: absolute; inset: 0; z-index: 1;';
        // Make parent a positioning context
        if (parent.style.position === '' || parent.style.position === 'static') {
          parent.style.position = 'relative';
        }
        parent.insertBefore(container, nativeChat);
      }

      return container;
    } catch {
      console.warn('[AllChat YouTube] ytd-live-chat-frame not found after timeout — native chat remains visible');
      return null;
    }
  }
}

/**
 * Inject "Switch to AllChat" button into native platform pop-out chat (D-11).
 * Clicking navigates the pop-out window to AllChat's chat-container.html (D-12).
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

/**
 * Handle extension enable/disable state changes
 */
function handleExtensionStateChange(enabled: boolean) {
  console.log(`[AllChat YouTube] Extension state changed: ${enabled ? 'enabled' : 'disabled'}`);

  if (!enabled) {
    if (globalDetector) {
      globalDetector.removeAllChatUI();
      globalDetector.showNativeChat();
      globalDetector = null;
    }
  } else {
    // Re-enable: create detector and init without page reload (per D-04)
    if (!globalDetector) {
      globalDetector = new YouTubeDetector();
      setupGlobalMessageRelay(); // idempotent via guard
      globalDetector.init();
    }
  }
}

// Initialize detector
async function initialize() {
  console.log('[AllChat YouTube] Content script loaded');

  // Check if extension is enabled
  const settings = await getSyncStorage();
  if (!settings.platformEnabled.youtube) {
    console.log('[AllChat YouTube] Extension disabled for YouTube, not injecting');
    setupGlobalMessageRelay(); // Listen for re-enable even when disabled
    return;
  }

  // Detect YouTube native pop-out chat: /live_chat or /live_chat_replay
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

  // Signal to popup which platform page the user is on
  chrome.runtime.sendMessage({ type: 'SET_CURRENT_PLATFORM', platform: 'youtube' }).catch((err: unknown) => {
    console.warn('[AllChat YouTube] Failed to write current_platform to session:', err);
  });

  // Set up message relay IMMEDIATELY (before any async operations)
  setupGlobalMessageRelay();

  // Wait for channel name to render before init — on /watch?v= URLs the DOM
  // isn't ready when the content script fires, causing extractStreamerUsername to fail.
  // waitForElement handles both loading and already-loaded states.
  await globalDetector.waitForElement('ytd-channel-name a').catch(() => null);
  globalDetector?.init();

  // Watch for URL changes (YouTube is an SPA) — registered once
  setupUrlWatcher();
}

/**
 * Set up global message relay from service worker to iframe
 */
function setupGlobalMessageRelay() {
  if (messageRelaySetup) return;
  messageRelaySetup = true;

  // Listen for messages FROM service worker TO iframes
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[AllChat YouTube] Received from service worker:', message.type);

    // Handle extension state changes
    if (message.type === 'EXTENSION_STATE_CHANGED') {
      handleExtensionStateChange(message.enabled);
      return false;
    }

    // Relay CONNECTION_STATE and WS_MESSAGE to all AllChat iframes
    if (message.type === 'CONNECTION_STATE' || message.type === 'WS_MESSAGE') {
      const iframes = document.querySelectorAll('iframe[data-platform="youtube"][data-streamer]');
      console.log(`[AllChat YouTube] Relaying to ${iframes.length} iframe(s)`);

      iframes.forEach((iframe) => {
        const iframeElement = iframe as HTMLIFrameElement;
        if (iframeElement.contentWindow) {
          const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
          iframeElement.contentWindow.postMessage(message, extensionOrigin);
          console.log('[AllChat YouTube] Relayed message to iframe:', message.type);
        }
      });
    }
    return false;
  });

  // Listen for messages FROM iframes requesting current state or login
  window.addEventListener('message', async (event) => {
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);

    if (event.data.type === 'GET_CONNECTION_STATE') {
      console.log('[AllChat YouTube] iframe requested connection state');
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

/**
 * Watch for URL changes using YouTube SPA navigation events.
 * yt-navigate-finish is the canonical YouTube SPA signal — fires once per navigation.
 * popstate handles browser back/forward. Both are deduplicated via URL equality check.
 */
function setupUrlWatcher(): void {
  let activeUrl = location.href;

  const handleNavigation = () => {
    const url = location.href;
    if (url === activeUrl) return; // Dedup: both events may fire for same navigation
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

/**
 * Watch for YouTube theater/cinema mode toggles and reinitialise the UI.
 * When the user enters or exits theater mode, YouTube reflowing the layout
 * breaks the injected container's absolute positioning context. Tearing down
 * and re-injecting after a short reflow delay restores correct rendering.
 */
function setupTheaterModeWatcher(): void {
  const watchFlexy = document.querySelector('ytd-watch-flexy');
  if (!watchFlexy) return;

  let reinitTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (!globalDetector) return;
    // Debounce: YouTube may toggle multiple attributes in quick succession
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

// Start initialization
initialize().then(() => {
  setupTheaterModeWatcher();
});
