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
    const chatContainer = this.findChatContainer();
    if (chatContainer) {
      // Hide the parent container that holds the entire chat
      const chatParent = chatContainer.closest('.right-column') || chatContainer.parentElement;
      if (chatParent) {
        (chatParent as HTMLElement).style.display = 'none';
        (chatParent as HTMLElement).setAttribute('data-allchat-hidden', 'true');
      }
    }
  }

  createInjectionPoint(): HTMLElement | null {
    const nativeChat = this.findChatContainer();
    if (!nativeChat) return null;

    const parent = nativeChat.closest('.right-column')?.parentElement || nativeChat.parentElement;
    if (!parent) return null;

    // Create replacement container
    const container = document.createElement('div');
    container.id = 'allchat-container';
    container.className = 'right-column';  // Mimic Twitch's class for layout
    container.style.cssText = `
      width: 340px;
      height: 100%;
      background-color: #18181b;
      display: flex;
      flex-direction: column;
    `;

    parent.appendChild(container);
    return container;
  }
}

// Initialize detector
function initialize() {
  console.log('[AllChat Twitch] Content script loaded');

  const detector = new TwitchDetector();

  // Wait for chat to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => detector.init(), 1000);  // Give Twitch time to render
    });
  } else {
    setTimeout(() => detector.init(), 1000);
  }

  // Watch for React re-renders
  setupMutationObserver(detector);

  // Watch for URL changes (Twitch is an SPA)
  setupUrlWatcher(detector);
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
