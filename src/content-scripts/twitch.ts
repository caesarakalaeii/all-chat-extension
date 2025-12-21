/**
 * Twitch Content Script
 *
 * Handles All-Chat injection on Twitch.tv
 * URL format: twitch.tv/username
 */

import { PlatformDetector } from './base/PlatformDetector';

class TwitchDetector extends PlatformDetector {
  platform = 'twitch' as const;

  extractStreamerUsername(): string | null {
    // Extract from URL: twitch.tv/username or twitch.tv/username/video/123
    const match = window.location.pathname.match(/^\/([^\/]+)/);
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

  createInjectionPoint(): HTMLElement | null {
    // Find the right column chat container
    const rightColumn = document.querySelector('[class*="right-column"]') ||
                        document.querySelector('[data-a-target="right-column-chat-bar"]');

    if (!rightColumn) {
      console.error('[AllChat] Could not find right column');
      return null;
    }

    // Create overlay container that sits on top
    const container = document.createElement('div');
    container.id = 'allchat-container';
    container.style.cssText = `
      position: fixed;
      top: 50px;
      right: 0;
      width: 340px;
      height: calc(100vh - 50px);
      background-color: #18181b;
      display: flex;
      flex-direction: column;
      z-index: 1000;
    `;

    document.body.appendChild(container);
    return container;
  }
}

// Store detector instance globally so message relay can access it
let globalDetector: TwitchDetector | null = null;

// Initialize detector
function initialize() {
  const manifest = chrome.runtime.getManifest();
  console.log(`[AllChat Twitch] Content script loaded - v${manifest.version}`);

  globalDetector = new TwitchDetector();

  // Set up message relay IMMEDIATELY (before any async operations)
  setupGlobalMessageRelay();

  // Wait for chat to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => globalDetector!.init(), 1000);  // Give Twitch time to render
    });
  } else {
    setTimeout(() => globalDetector!.init(), 1000);
  }

  // Watch for React re-renders
  setupMutationObserver(globalDetector);

  // Watch for URL changes (Twitch is an SPA)
  setupUrlWatcher(globalDetector);
}

/**
 * Set up global message relay from service worker to iframe
 * This is called immediately when content script loads to avoid missing messages
 */
function setupGlobalMessageRelay() {
  // Listen for messages FROM service worker TO iframes
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[AllChat Twitch] Received from service worker:', message.type);

    // Relay CONNECTION_STATE and WS_MESSAGE to all AllChat iframes
    if (message.type === 'CONNECTION_STATE' || message.type === 'WS_MESSAGE') {
      const iframes = document.querySelectorAll('iframe[data-platform="twitch"][data-streamer]');
      console.log(`[AllChat Twitch] Relaying to ${iframes.length} iframe(s)`);

      iframes.forEach((iframe) => {
        const iframeElement = iframe as HTMLIFrameElement;
        if (iframeElement.contentWindow) {
          iframeElement.contentWindow.postMessage(message, '*');
          console.log('[AllChat Twitch] Relayed message to iframe:', message.type);
        }
      });
    }
    return false;
  });

  // Listen for messages FROM iframes requesting current state
  window.addEventListener('message', async (event) => {
    if (event.data.type === 'GET_CONNECTION_STATE') {
      console.log('[AllChat Twitch] iframe requested connection state');
      // Request from service worker
      const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATE' });
      if (response.success && event.source) {
        // Send back to the iframe that requested it
        (event.source as Window).postMessage({
          type: 'CONNECTION_STATE',
          data: response.data
        }, '*');
        console.log('[AllChat Twitch] Sent current connection state to iframe:', response.data);
      }
    }
  });

  console.log('[AllChat Twitch] Global message relay set up');
}

/**
 * Set up MutationObserver to detect when Twitch re-renders and removes our UI
 */
function setupMutationObserver(detector: TwitchDetector) {
  let reinitTimeout: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    const allchatExists = document.getElementById('allchat-container');
    const nativeExists = document.querySelector('.chat-scrollable-area__message-container');

    // If our container was removed but native chat exists, re-inject
    if (!allchatExists && nativeExists) {
      console.log('[AllChat Twitch] Detected re-render, re-injecting...');

      // Debounce re-initialization
      if (reinitTimeout) clearTimeout(reinitTimeout);
      reinitTimeout = setTimeout(() => {
        detector.init();
      }, 500);
    }

    // If AllChat exists but native chat is visible, hide it again
    if (allchatExists && nativeExists) {
      const nativeColumn = document.querySelector('.right-column:not(#allchat-container)') as HTMLElement;
      if (nativeColumn && nativeColumn.style.display !== 'none') {
        detector.hideNativeChat();
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Watch for URL changes (Twitch uses client-side routing)
 */
function setupUrlWatcher(detector: TwitchDetector) {
  let lastUrl = location.href;

  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('[AllChat Twitch] URL changed, re-initializing...');
      setTimeout(() => detector.init(), 1000);
    }
  }).observe(document, { subtree: true, childList: true });
}

// Start initialization
initialize();
