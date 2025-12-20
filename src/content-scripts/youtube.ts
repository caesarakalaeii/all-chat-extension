/**
 * YouTube Content Script
 *
 * Handles All-Chat injection on YouTube.com
 * URL formats: youtube.com/watch?v=..., youtube.com/live/..., youtube.com/@username
 */

import { PlatformDetector } from './base/PlatformDetector';

class YouTubeDetector extends PlatformDetector {
  platform = 'youtube' as const;

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

    // Method 3: From channel name in header
    const channelName = document.querySelector('ytd-channel-name a')?.textContent?.trim();
    if (channelName) return channelName;

    return null;
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
    const chatFrame = this.findChatContainer();
    if (chatFrame) {
      (chatFrame as HTMLElement).style.display = 'none';
      (chatFrame as HTMLElement).setAttribute('data-allchat-hidden', 'true');
    }
  }

  createInjectionPoint(): HTMLElement | null {
    const nativeChat = this.findChatContainer();
    if (!nativeChat) return null;

    const parent = nativeChat.parentElement;
    if (!parent) return null;

    // Create replacement container
    const container = document.createElement('div');
    container.id = 'allchat-container';
    container.style.cssText = `
      width: 100%;
      height: 100%;
      background-color: #0f0f0f;
      display: flex;
      flex-direction: column;
    `;

    parent.appendChild(container);
    return container;
  }
}

// Initialize detector
function initialize() {
  console.log('[AllChat YouTube] Content script loaded');

  const detector = new YouTubeDetector();

  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => detector.init(), 2000);  // YouTube needs more time
    });
  } else {
    setTimeout(() => detector.init(), 2000);
  }

  // Watch for URL changes (YouTube is an SPA)
  setupUrlWatcher(detector);
}

/**
 * Watch for URL changes
 */
function setupUrlWatcher(detector: YouTubeDetector) {
  let lastUrl = location.href;

  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('[AllChat YouTube] URL changed, re-initializing...');
      setTimeout(() => detector.init(), 2000);
    }
  }).observe(document, { subtree: true, childList: true });
}

// Start initialization
initialize();
