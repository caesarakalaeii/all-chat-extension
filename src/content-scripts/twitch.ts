/**
 * Twitch Content Script
 *
 * Handles All-Chat injection on Twitch.tv
 * URL format: twitch.tv/username
 */

import { PlatformDetector } from './base/PlatformDetector';
import { getSyncStorage } from '../lib/storage';

// Module-level slot observer — shared between createInjectionPoint and teardown
let slotObserver: MutationObserver | null = null;

class TwitchDetector extends PlatformDetector {
  platform = 'twitch' as const;

  extractStreamerUsername(): string | null {
    // Extract from URL: twitch.tv/username or twitch.tv/username/video/123
    const match = window.location.pathname.match(/^\/([^/]+)/);
    if (!match) return null;

    const username = match[1];

    // Exclude special pages
    const excluded = ['directory', 'downloads', 'jobs', 'turbo', 'settings', 'subscriptions', 'inventory', 'wallet', 'drops'];
    if (excluded.includes(username.toLowerCase())) {
      return null;
    }

    return username;
  }

  getChatContainerSelector(): string[] {
    // Multi-level fallback selectors for Twitch chat
    // Ordered from most stable to least stable
    return [
      '[data-test-selector="chat-scrollable-area"]',  // Most stable (data attribute)
      'div[role="log"]',                              // ARIA role (very stable)
      '.chat-scrollable-area__message-container',     // Class name
      '.chat-shell',                                  // Legacy class
      '.right-column',                                // Column container
      '[data-a-target="right-column-chat-bar"]',     // Alternative data attribute
    ];
  }

  hideNativeChat(): void {
    // Use CSS to hide native chat elements without removing them from DOM
    // This is more stable than display:none which can break Twitch's layout

    const style = document.getElementById('allchat-hide-native-style') as HTMLStyleElement;
    if (style) return; // Already injected

    const hideStyle = document.createElement('style');
    hideStyle.id = 'allchat-hide-native-style';
    hideStyle.textContent = `
      /* Hide native Twitch chat components */
      [data-a-target="chat-input"],
      [data-a-target="chat-welcome-message"],
      div[role="log"][class*="chat"],
      .chat-input,
      .chat-input__textarea,
      .stream-chat-header,
      .chat-scrollable-area__message-container,
      .chat-wysiwyg-input {
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(hideStyle);
    console.log('[AllChat Twitch] Injected CSS to hide native chat');
  }

  showNativeChat(): void {
    // Remove the hiding style to restore native chat
    const style = document.getElementById('allchat-hide-native-style');
    if (style) {
      style.remove();
      console.log('[AllChat Twitch] Removed CSS to show native chat');
    }
  }

  removeAllChatUI(): void {
    // Remove All-Chat container
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat Twitch] Removed All-Chat UI');
    }
  }

  async createInjectionPoint(): Promise<HTMLElement | null> {
    try {
      // .chat-shell is the Twitch native chat slot.
      // On offline channel pages it only exists after the "Chat" tab is clicked,
      // so we wait up to 60s to accommodate offline channel visits.
      const slot = await this.waitForElement('.chat-shell', 60_000);
      // Make .chat-shell a positioning context so allchat-container can overlay it
      slot.style.position = 'relative';
      const container = document.createElement('div');
      container.id = 'allchat-container';
      // Absolute overlay — native chat sits as first child, we overlay it
      container.style.cssText = 'position: absolute; inset: 0; z-index: 1;';
      slot.appendChild(container);

      // Set up scoped MutationObserver on .chat-shell's parent (INJ-03)
      if (slot.parentElement) {
        slotObserver?.disconnect();
        slotObserver = new MutationObserver(() => {
          const slotExists = slot.parentElement?.querySelector('.chat-shell');
          const containerExists = document.getElementById('allchat-container');
          if (!slotExists && !containerExists && globalDetector) {
            console.log('[AllChat Twitch] .chat-shell removed, re-running waitForElement...');
            globalDetector.init();
          }
        });
        slotObserver.observe(slot.parentElement, { childList: true, subtree: false });
      } else {
        console.warn('[AllChat Twitch] .chat-shell has no parentElement — slot observer not set up');
      }

      return container;
    } catch {
      console.warn('[AllChat Twitch] .chat-shell not found after timeout — native chat remains visible');
      return null;
    }
  }

  teardown(): void {
    slotObserver?.disconnect();
    slotObserver = null;
    super.teardown();
  }
}

// Store detector instance globally so message relay can access it
let globalDetector: TwitchDetector | null = null;

// Track last checked streamer to avoid redundant re-injections
let lastCheckedStreamer: string | null = null;

// Guard against duplicate message relay registration
let messageRelaySetup = false;

// Initialize detector
async function initialize() {
  const manifest = chrome.runtime.getManifest();
  console.log(`[AllChat Twitch] Content script loaded - v${manifest.version}`);

  // Check if extension is enabled
  const settings = await getSyncStorage();
  if (!settings.platformEnabled.twitch) {
    console.log('[AllChat Twitch] Extension disabled for Twitch, not injecting');
    setupGlobalMessageRelay(); // Listen for re-enable even when disabled
    return;
  }

  globalDetector = new TwitchDetector();

  // Set up message relay IMMEDIATELY (before any async operations)
  setupGlobalMessageRelay();

  // Signal to popup which platform page the user is on
  chrome.runtime.sendMessage({ type: 'SET_CURRENT_PLATFORM', platform: 'twitch' }).catch((err: unknown) => {
    console.warn('[AllChat Twitch] Failed to write current_platform to session:', err);
  });

  // Wait for chat to load — waitForElement handles timing via preDelayMs
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      globalDetector?.init();
    });
  } else {
    globalDetector?.init();
  }

  // Watch for URL changes (Twitch is an SPA)
  setupUrlWatcher();

  // Watch for Chat tab clicks on offline channel pages
  setupChatTabWatcher();
}

/**
 * Handle extension enable/disable state changes
 */
function handleExtensionStateChange(enabled: boolean) {
  console.log(`[AllChat Twitch] Extension state changed: ${enabled ? 'enabled' : 'disabled'}`);

  if (!enabled) {
    if (globalDetector) {
      globalDetector.teardown();
      globalDetector = null;
    }
  } else {
    // Re-enable: create detector and init without page reload (per D-04)
    if (!globalDetector) {
      globalDetector = new TwitchDetector();
      setupGlobalMessageRelay(); // idempotent via guard
      globalDetector.init();
      setupUrlWatcher();
      setupChatTabWatcher();
    }
  }
}

/**
 * Set up global message relay from service worker to iframe
 * This is called immediately when content script loads to avoid missing messages
 */
function setupGlobalMessageRelay() {
  if (messageRelaySetup) return;
  messageRelaySetup = true;

  // Listen for messages FROM service worker TO iframes
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[AllChat Twitch] Received from service worker:', message.type);

    // Handle extension state changes
    if (message.type === 'EXTENSION_STATE_CHANGED') {
      handleExtensionStateChange(message.enabled);
      return false;
    }

    // Relay CONNECTION_STATE and WS_MESSAGE to all AllChat iframes
    if (message.type === 'CONNECTION_STATE' || message.type === 'WS_MESSAGE') {
      const iframes = document.querySelectorAll('iframe[data-platform="twitch"][data-streamer]');
      console.log(`[AllChat Twitch] Relaying to ${iframes.length} iframe(s)`);

      iframes.forEach((iframe) => {
        const iframeElement = iframe as HTMLIFrameElement;
        if (iframeElement.contentWindow) {
          const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
          iframeElement.contentWindow.postMessage(message, extensionOrigin);
          console.log('[AllChat Twitch] Relayed message to iframe:', message.type);
        }
      });
    }
    return false;
  });

  // Listen for messages FROM iframes requesting current state or login
  window.addEventListener('message', async (event) => {
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);

    if (event.data.type === 'GET_CONNECTION_STATE') {
      console.log('[AllChat Twitch] iframe requested connection state');
      const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATE' });
      if (response.success && event.source) {
        (event.source as Window).postMessage({
          type: 'CONNECTION_STATE',
          data: response.data
        }, extensionOrigin);
      }
    }

    if (event.data.type === 'REQUEST_LOGIN' && event.source) {
      console.log('[AllChat Twitch] iframe requested login, opening popup from page context');
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
            // Store token via service worker then notify iframe
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

  console.log('[AllChat Twitch] Global message relay set up');
}

/**
 * Watch for URL changes (Twitch uses client-side routing)
 * Calls teardown() immediately on URL change before re-calling init()
 */
function setupUrlWatcher() {
  let lastUrl = location.href;

  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      lastCheckedStreamer = null;
      console.log('[AllChat Twitch] URL changed, tearing down...');
      globalDetector?.teardown();
      globalDetector?.init();
    }
  }).observe(document, { subtree: true, childList: true });
}

/**
 * Watch for the Twitch "Chat" tab being clicked on offline channel pages.
 * When a channel is offline, the chat panel is hidden until the user clicks
 * the Chat tab — .chat-shell only renders after that interaction.
 * Re-runs init() when the tab is clicked so injection can proceed.
 */
function setupChatTabWatcher() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    // The Chat tab contains a paragraph with text "Chat"
    const isChatTab = target.closest('[data-a-target="channel-home-tab-Chat"]') ||
      target.closest('a[href$="/chat"]') ||
      (target.tagName === 'P' && target.textContent?.trim() === 'Chat') ||
      target.closest('button')?.querySelector('p')?.textContent?.trim() === 'Chat';

    if (isChatTab && globalDetector && !document.getElementById('allchat-container')) {
      console.log('[AllChat Twitch] Chat tab clicked, re-running init...');
      globalDetector.init();
    }
  });
}

// Start initialization
initialize();
