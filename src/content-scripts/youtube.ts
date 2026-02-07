/**
 * YouTube Content Script
 *
 * Handles All-Chat injection on YouTube.com
 * URL formats: youtube.com/watch?v=..., youtube.com/live/..., youtube.com/@username
 */

import { PlatformDetector } from './base/PlatformDetector';
import { getSyncStorage } from '../lib/storage';

// Delay for YouTube initialization (ms) - YouTube needs more time to load
const YOUTUBE_INIT_DELAY = 2000;

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
    }

    // Method 4: From owner link in video page
    const ownerLink = document.querySelector('a.yt-simple-endpoint.ytd-video-owner-renderer');
    if (ownerLink) {
      const href = ownerLink.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Override init to check for live streams first
   */
  async init(): Promise<void> {
    console.log(`[AllChat ${this.platform}] Initializing...`);

    // YouTube-specific: Only activate on live streams, not VODs
    if (!this.isLiveStream()) {
      console.log(`[AllChat ${this.platform}] Not a live stream, skipping`);
      return;
    }

    // Continue with normal initialization
    return super.init();
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

  showNativeChat(): void {
    const chatFrame = document.querySelector('[data-allchat-hidden="true"]');
    if (chatFrame) {
      (chatFrame as HTMLElement).style.display = '';
      (chatFrame as HTMLElement).removeAttribute('data-allchat-hidden');
      console.log('[AllChat YouTube] Removed hiding to show native chat');
    }
  }

  removeAllChatUI(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat YouTube] Removed All-Chat UI');
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

  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => globalDetector?.init(), YOUTUBE_INIT_DELAY);
    });
  } else {
    setTimeout(() => globalDetector?.init(), YOUTUBE_INIT_DELAY);
  }

  // Watch for URL changes (YouTube is an SPA)
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
      const iframes = document.querySelectorAll('#allchat-iframe');
      console.log(`[AllChat YouTube] Relaying to ${iframes.length} iframe(s)`);

      iframes.forEach((iframe) => {
        const iframeElement = iframe as HTMLIFrameElement;
        if (iframeElement.contentWindow) {
          iframeElement.contentWindow.postMessage(message, '*');
          console.log('[AllChat YouTube] Relayed message to iframe:', message.type);
        }
      });
    }
    return false;
  });

  // Listen for messages FROM iframes requesting current state
  window.addEventListener('message', async (event) => {
    if (event.data.type === 'GET_CONNECTION_STATE') {
      console.log('[AllChat YouTube] iframe requested connection state');
      // Request from service worker
      const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATE' });
      if (response.success && event.source) {
        // Send back to the iframe that requested it
        (event.source as Window).postMessage({
          type: 'CONNECTION_STATE',
          data: response.data
        }, '*');
        console.log('[AllChat YouTube] Sent current connection state to iframe:', response.data);
      }
    }
  });

  console.log('[AllChat YouTube] Global message relay set up');
}

/**
 * Watch for URL changes
 */
function setupUrlWatcher() {
  let lastUrl = location.href;

  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('[AllChat YouTube] URL changed, re-initializing...');
      // Check if detector still exists (extension might have been disabled)
      if (globalDetector) {
        setTimeout(() => globalDetector?.init(), YOUTUBE_INIT_DELAY);
      }
    }
  }).observe(document, { subtree: true, childList: true });
}

// Start initialization
initialize();
