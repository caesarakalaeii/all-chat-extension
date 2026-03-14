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
    // Method 1: From URL (@username format)
    const urlMatch = window.location.pathname.match(/@([^\/]+)/);
    if (urlMatch) return urlMatch[1];

    // Method 2: From page metadata
    const channelLink = document.querySelector('link[itemprop="url"]');
    if (channelLink) {
      const href = channelLink.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
    }

    // Method 3: From channel link in header (extract handle from href)
    const channelNameElement = document.querySelector('ytd-channel-name a');
    if (channelNameElement) {
      const href = channelNameElement.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
      // Also try /channel/UC... format for channels without a handle
      const idMatch = href?.match(/\/channel\/(UC[^\/]+)/);
      if (idMatch) return idMatch[1];
    }

    // Method 4: From owner link in video page
    const ownerLink = document.querySelector('a.yt-simple-endpoint.ytd-video-owner-renderer');
    if (ownerLink) {
      const href = ownerLink.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
      const idMatch = href?.match(/\/channel\/(UC[^\/]+)/);
      if (idMatch) return idMatch[1];
    }

    // Method 5: From ytInitialData script — most reliable for channels without handles
    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      const dataScript = scripts.find(s => s.textContent?.includes('channelId'));
      if (dataScript && dataScript.textContent) {
        const match = dataScript.textContent.match(/"channelId":"(UC[^"]+)"/);
        if (match) return match[1];
      }
    } catch { /* ignore */ }

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
      const parent = nativeChat.parentElement;
      if (!parent) {
        console.warn('[AllChat YouTube] ytd-live-chat-frame has no parent — native chat remains visible');
        return null;
      }

      const container = document.createElement('div');
      container.id = 'allchat-container';
      // Position over the native chat frame absolutely so we fill the full
      // column height regardless of how YouTube sizes #chat-container
      container.style.cssText = 'position: absolute; inset: 0; z-index: 1;';
      // Make parent a positioning context
      if (parent.style.position === '' || parent.style.position === 'static') {
        parent.style.position = 'relative';
      }
      parent.insertBefore(container, nativeChat);
      return container;
    } catch {
      console.warn('[AllChat YouTube] ytd-live-chat-frame not found after timeout — native chat remains visible');
      return null;
    }
  }
}

// Store detector instance globally
let globalDetector: YouTubeDetector | null = null;

/**
 * Handle extension enable/disable state changes
 */
function handleExtensionStateChange(enabled: boolean) {
  console.log(`[AllChat YouTube] Extension state changed: ${enabled ? 'enabled' : 'disabled'}`);

  if (!enabled) {
    // Disable extension: remove UI and restore native chat
    if (globalDetector) {
      console.log('[AllChat YouTube] Disabling extension');
      globalDetector.removeAllChatUI();
      globalDetector.showNativeChat();
      globalDetector = null;
    }
  }
  // Note: Re-enabling is handled by page reload from popup
}

// Initialize detector
async function initialize() {
  console.log('[AllChat YouTube] Content script loaded');

  // Check if extension is enabled
  const settings = await getSyncStorage();
  if (!settings.extensionEnabled) {
    console.log('[AllChat YouTube] Extension is disabled, not injecting');
    return;
  }

  globalDetector = new YouTubeDetector();

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

// Start initialization
initialize();
