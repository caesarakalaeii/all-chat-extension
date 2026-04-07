/**
 * Kick Content Script
 *
 * Handles All-Chat injection on Kick.com
 * URL format: kick.com/<username>
 */

import { PlatformDetector } from './base/PlatformDetector';
import { getSyncStorage } from '../lib/storage';

class KickDetector extends PlatformDetector {
  platform = 'kick' as const;

  /**
   * Check if the current page is a live stream via Kick API.
   * DOM-based live badge detection is not reliable on Kick (no stable selector as of 2026-03-12).
   * API-based detection: GET kick.com/api/v2/channels/{slug} — livestream field is non-null when live.
   * This method is async; callers must await it.
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

  /**
   * Override init to check for live streams first via API
   */
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

    // Exclude non-channel paths
    const excluded = ['home', 'categories', 'search', 'subscriptions', 'settings', 'clip', 'clips'];
    if (excluded.includes(username.toLowerCase())) {
      return null;
    }

    return username;
  }

  getChatContainerSelector(): string[] {
    // Verified selectors against live kick.com (2026-03-12):
    // #channel-chatroom — confirmed present (340×1240px on live page). PRIMARY selector. Only needed.
    // #chatroom — does NOT exist on current Kick.com
    // .chatroom-wrapper — does NOT exist on current Kick.com
    return [
      '#channel-chatroom', // primary — verified 2026-03-12
    ];
  }

  hideNativeChat(): void {
    if (document.getElementById('allchat-hide-native-style')) return; // idempotent

    const style = document.createElement('style');
    style.id = 'allchat-hide-native-style';
    // Hide children of #channel-chatroom that are not the injected container.
    // Hiding the slot itself would remove the container; target children instead.
    // verified: 2026-03-12 — update if selector breaks
    style.textContent = `#channel-chatroom > *:not(#allchat-container) { display: none !important; /* verified: 2026-03-12 — update if selector breaks */ }`;
    document.head.appendChild(style);
    console.log('[AllChat Kick] Injected CSS to hide native chat');
  }

  showNativeChat(): void {
    const style = document.getElementById('allchat-hide-native-style');
    if (style) {
      style.remove();
      console.log('[AllChat Kick] Removed CSS to show native chat');
    }
  }

  removeAllChatUI(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat Kick] Removed All-Chat UI');
    }
  }

  async createInjectionPoint(): Promise<HTMLElement | null> {
    // Selector fallback chain — try in order, use first that resolves
    const SELECTORS = [
      '#channel-chatroom',   // primary — verified 2026-03-12
      '#chatroom',           // fallback 1 — verified 2026-03-12 (not present, kept for future)
      '.chatroom-wrapper',   // fallback 2 — verified 2026-03-12 (not present, kept for future)
    ];

    let slot: HTMLElement | null = null;

    for (const sel of SELECTORS) {
      try {
        slot = await this.waitForElement(sel);
        console.log(`[AllChat Kick] Found chat slot with selector: ${sel}`);
        break;
      } catch {
        // Selector not found, try next
      }
    }

    if (!slot) {
      console.warn('[AllChat Kick] No chat slot found — native chat remains visible');
      return null;
    }

    const container = document.createElement('div');
    container.id = 'allchat-container';
    container.style.cssText = 'width: 100%; height: 100%;';
    slot.appendChild(container);

    return container;
  }
}

// Store detector instance globally
let globalDetector: KickDetector | null = null;

// Guard against duplicate message relay registration
let messageRelaySetup = false;

/**
 * Handle extension enable/disable state changes
 */
function handleExtensionStateChange(enabled: boolean) {
  console.log(`[AllChat Kick] Extension state changed: ${enabled ? 'enabled' : 'disabled'}`);

  if (!enabled) {
    if (globalDetector) {
      globalDetector.teardown();
      globalDetector = null;
    }
  } else {
    // Re-enable: create detector and init without page reload (per D-04)
    if (!globalDetector) {
      globalDetector = new KickDetector();
      setupGlobalMessageRelay(); // idempotent via guard
      globalDetector.init();
      setupUrlWatcher();
    }
  }
}

// Initialize detector
async function initialize() {
  console.log('[AllChat Kick] Content script loaded');

  // Check if extension is enabled
  const settings = await getSyncStorage();
  if (!settings.platformEnabled.kick) {
    console.log('[AllChat Kick] Extension disabled for Kick, not injecting');
    setupGlobalMessageRelay(); // Listen for re-enable even when disabled
    return;
  }

  globalDetector = new KickDetector();

  // Signal to popup which platform page the user is on
  chrome.runtime.sendMessage({ type: 'SET_CURRENT_PLATFORM', platform: 'kick' }).catch((err: unknown) => {
    console.warn('[AllChat Kick] Failed to write current_platform to session:', err);
  });

  // Set up message relay IMMEDIATELY (before any async operations)
  setupGlobalMessageRelay();

  // isLiveStream() check is handled inside init()
  globalDetector.init();

  // Watch for URL changes (Kick is an SPA)
  setupUrlWatcher();
}

/**
 * Set up global message relay from service worker to iframe
 * This is called immediately when content script loads to avoid missing messages
 */
function setupGlobalMessageRelay() {
  if (messageRelaySetup) return;
  messageRelaySetup = true;

  // Listen for messages FROM service worker TO iframes
  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    console.log('[AllChat Kick] Received from service worker:', message.type);

    // Handle extension state changes
    if (message.type === 'EXTENSION_STATE_CHANGED') {
      handleExtensionStateChange(message.enabled);
      return false;
    }

    // Relay CONNECTION_STATE and WS_MESSAGE to all AllChat iframes
    if (message.type === 'CONNECTION_STATE' || message.type === 'WS_MESSAGE') {
      const iframes = document.querySelectorAll('iframe[data-platform="kick"]');
      console.log(`[AllChat Kick] Relaying to ${iframes.length} iframe(s)`);

      iframes.forEach((iframe) => {
        const iframeElement = iframe as HTMLIFrameElement;
        if (iframeElement.contentWindow) {
          const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
          iframeElement.contentWindow.postMessage(message, extensionOrigin);
          console.log('[AllChat Kick] Relayed message to iframe:', message.type);
        }
      });
    }
    return false;
  });

  // Listen for messages FROM iframes requesting current state
  window.addEventListener('message', async (event) => {
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);

    if (event.data.type === 'GET_CONNECTION_STATE') {
      console.log('[AllChat Kick] iframe requested connection state');
      // Request from service worker
      const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATE' });
      if (response.success && event.source) {
        // Send back to the iframe that requested it
        (event.source as Window).postMessage({
          type: 'CONNECTION_STATE',
          data: response.data
        }, extensionOrigin);
        console.log('[AllChat Kick] Sent current connection state to iframe:', response.data);
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

/**
 * Watch for URL changes using SPA navigation detection.
 * popstate handles browser back/forward navigation.
 * MutationObserver on title handles Next.js pushState navigation.
 * Both are deduplicated via URL equality check.
 */
function setupUrlWatcher(): void {
  let activeUrl = location.href;

  const handleNavigation = async () => {
    const url = location.href;
    if (url === activeUrl) return; // Dedup: both events may fire for same navigation
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

  // popstate handles back/forward navigation
  window.addEventListener('popstate', handleNavigation);

  // MutationObserver on title handles Next.js pushState navigation
  new MutationObserver(handleNavigation).observe(
    document.querySelector('title') || document.head,
    { childList: true, characterData: true, subtree: true }
  );
}

// Start initialization
initialize();
