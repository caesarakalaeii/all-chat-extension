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

/**
 * Build the tab bar DOM element per UI-SPEC Layout Contract (D-04 through D-08).
 * The tab bar is injected as a sibling of #allchat-container inside .chat-shell.
 * Inline styles reference hardcoded OkLCh/hex values that match src/ui/styles.css tokens.
 */
function createTabBar(): HTMLElement {
  const tabBar = document.createElement('div');
  tabBar.id = 'allchat-tab-bar';
  tabBar.setAttribute('role', 'tablist');
  tabBar.setAttribute('aria-label', 'Chat view switcher');
  tabBar.style.cssText = `
    position: absolute; top: 0; left: 0; right: 0; z-index: 2;
    height: 36px; display: flex;
    background: oklch(0.11 0.009 270);
    border-bottom: 1px solid oklch(from #fff l c h / 0.06);
    font-family: Inter, system-ui, sans-serif;
    font-size: 13px; font-weight: 600; line-height: 1;
  `;

  // AllChat tab (left)
  const allchatTab = document.createElement('button');
  allchatTab.id = 'allchat-tab-allchat';
  allchatTab.setAttribute('role', 'tab');
  allchatTab.setAttribute('aria-selected', 'true');
  allchatTab.setAttribute('aria-label', 'AllChat tab — cross-platform chat view');
  allchatTab.style.cssText = `
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    background: none; border: none; border-bottom: 2px solid #A37BFF;
    border-right: 1px solid oklch(from #fff l c h / 0.06);
    color: oklch(0.91 0.003 270); cursor: pointer;
    padding: 0 8px; transition: color 0.15s ease;
    font-family: inherit; font-size: inherit; font-weight: inherit;
  `;

  // InfinityLogo inline SVG (16px, stroke #A37BFF) — static simplified version
  // (no animation — content script cannot use React)
  // SVG path from InfinityLogo.tsx: inf = 'M6 10c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8'
  const logoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  logoSvg.setAttribute('width', '16');
  logoSvg.setAttribute('height', '10');
  logoSvg.setAttribute('viewBox', '0 0 24 14');
  logoSvg.setAttribute('fill', 'none');
  logoSvg.setAttribute('aria-hidden', 'true');
  const infPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  infPath.setAttribute('d', 'M6 10c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8');
  infPath.setAttribute('stroke', '#A37BFF');
  infPath.setAttribute('stroke-width', '2.5');
  infPath.setAttribute('stroke-linecap', 'round');
  logoSvg.appendChild(infPath);
  allchatTab.appendChild(logoSvg);

  const allchatLabel = document.createElement('span');
  allchatLabel.textContent = 'AllChat';
  allchatTab.appendChild(allchatLabel);

  // Connection dot (6px, initially yellow/connecting) — right of AllChat text
  const connDot = document.createElement('span');
  connDot.id = 'allchat-tab-conn-dot';
  connDot.style.cssText = `
    width: 6px; height: 6px; border-radius: 50%;
    background: #facc15; flex-shrink: 0;
  `;
  allchatTab.appendChild(connDot);

  // Twitch Chat tab (right)
  const twitchTab = document.createElement('button');
  twitchTab.id = 'allchat-tab-twitch';
  twitchTab.setAttribute('role', 'tab');
  twitchTab.setAttribute('aria-selected', 'false');
  twitchTab.setAttribute('aria-label', 'Twitch Chat tab — native Twitch chat view');
  twitchTab.style.cssText = `
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
    background: none; border: none; border-bottom: 2px solid transparent;
    color: oklch(0.58 0.007 270); cursor: pointer;
    padding: 0 8px; transition: color 0.15s ease;
    font-family: inherit; font-size: inherit; font-weight: inherit;
  `;
  twitchTab.textContent = 'Twitch Chat';

  // Focus-visible outlines (accessibility — WCAG 2.4.7)
  [allchatTab, twitchTab].forEach(tab => {
    tab.addEventListener('focus', () => {
      if (tab.matches(':focus-visible')) {
        tab.style.outline = '2px solid #A37BFF';
        tab.style.outlineOffset = '-2px';
      }
    });
    tab.addEventListener('blur', () => {
      tab.style.outline = 'none';
    });
  });

  // Hover states
  allchatTab.addEventListener('mouseenter', () => { allchatTab.style.background = 'oklch(0.14 0.008 270)'; });
  allchatTab.addEventListener('mouseleave', () => { allchatTab.style.background = 'none'; });
  twitchTab.addEventListener('mouseenter', () => { twitchTab.style.background = 'oklch(0.14 0.008 270)'; });
  twitchTab.addEventListener('mouseleave', () => { twitchTab.style.background = 'none'; });

  tabBar.appendChild(allchatTab);
  tabBar.appendChild(twitchTab);

  return tabBar;
}

/**
 * Wire click handlers on tab bar buttons.
 * Replaces the old SWITCH_TO_NATIVE message handling for Twitch.
 * @param detector TwitchDetector instance (for hideNativeChat / showNativeChat)
 */
function setupTabSwitching(detector: TwitchDetector): void {
  const allchatTab = document.getElementById('allchat-tab-allchat') as HTMLButtonElement | null;
  const twitchTab = document.getElementById('allchat-tab-twitch') as HTMLButtonElement | null;

  if (!allchatTab || !twitchTab) {
    console.warn('[AllChat Twitch] Tab bar buttons not found — setupTabSwitching skipped');
    return;
  }

  twitchTab.addEventListener('click', () => {
    switchToTwitchTab(detector);
  });

  allchatTab.addEventListener('click', () => {
    switchToAllChatTab(detector);
  });
}

/**
 * Activate the Twitch Chat tab: hide AllChat, restore native chat.
 */
function switchToTwitchTab(detector: TwitchDetector): void {
  const allchatTab = document.getElementById('allchat-tab-allchat') as HTMLButtonElement | null;
  const twitchTab = document.getElementById('allchat-tab-twitch') as HTMLButtonElement | null;
  const container = document.getElementById('allchat-container');

  if (container) {
    container.style.display = 'none';
  }
  // Remove native chat hide style to restore native Twitch chat visibility
  detector.showNativeChat();

  if (allchatTab) {
    allchatTab.setAttribute('aria-selected', 'false');
    allchatTab.style.borderBottom = '2px solid transparent';
    allchatTab.style.color = 'oklch(0.58 0.007 270)';
  }
  if (twitchTab) {
    twitchTab.setAttribute('aria-selected', 'true');
    twitchTab.style.borderBottom = '2px solid #A37BFF';
    twitchTab.style.color = 'oklch(0.91 0.003 270)';
  }
  console.log('[AllChat Twitch] Switched to Twitch Chat tab');
}

/**
 * Activate the AllChat tab: restore AllChat, hide native chat.
 */
function switchToAllChatTab(detector: TwitchDetector): void {
  const allchatTab = document.getElementById('allchat-tab-allchat') as HTMLButtonElement | null;
  const twitchTab = document.getElementById('allchat-tab-twitch') as HTMLButtonElement | null;
  const container = document.getElementById('allchat-container');

  if (container) {
    container.style.display = '';
  }
  // Re-inject native chat hide style
  detector.hideNativeChat();

  if (allchatTab) {
    allchatTab.setAttribute('aria-selected', 'true');
    allchatTab.style.borderBottom = '2px solid #A37BFF';
    allchatTab.style.color = 'oklch(0.91 0.003 270)';
  }
  if (twitchTab) {
    twitchTab.setAttribute('aria-selected', 'false');
    twitchTab.style.borderBottom = '2px solid transparent';
    twitchTab.style.color = 'oklch(0.58 0.007 270)';
  }
  console.log('[AllChat Twitch] Switched to AllChat tab');
}

class TwitchDetector extends PlatformDetector {
  platform = 'twitch' as const;

  extractStreamerUsername(): string | null {
    const pathname = window.location.pathname;

    // Handle Twitch pop-out chat URL: /popout/{channel}/chat
    // extractStreamerUsername returns "popout" without this fix (RESEARCH Pitfall 4)
    const popoutMatch = pathname.match(/^\/popout\/([^/]+)\/chat/);
    if (popoutMatch) {
      return popoutMatch[1];
    }

    // Standard: twitch.tv/username or twitch.tv/username/video/123
    const match = pathname.match(/^\/([^/]+)/);
    if (!match) return null;

    const username = match[1];

    // Exclude special pages
    const excluded = ['directory', 'downloads', 'jobs', 'turbo', 'settings', 'subscriptions', 'inventory', 'wallet', 'drops', 'popout'];
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
    // Remove All-Chat container and tab bar
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat Twitch] Removed All-Chat UI');
    }
    const tabBar = document.getElementById('allchat-tab-bar');
    if (tabBar) {
      tabBar.remove();
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

      // Create and inject tab bar as sibling to #allchat-container (D-04 through D-08)
      const tabBar = createTabBar();
      slot.appendChild(tabBar);

      // Create #allchat-container as flex column with padding-top for the tab bar
      const container = document.createElement('div');
      container.id = 'allchat-container';
      container.style.cssText = 'position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; padding-top: 36px;';

      // Top widget zone — transient widgets (predictions, polls, hype trains, raids)
      const widgetZoneTop = document.createElement('div');
      widgetZoneTop.id = 'allchat-widget-zone-top';
      widgetZoneTop.setAttribute('role', 'region');
      widgetZoneTop.setAttribute('aria-label', 'Twitch interactive widgets — predictions, polls, hype trains');
      widgetZoneTop.style.cssText = 'flex: 0 0 auto; overflow: hidden; max-height: 0;';
      container.appendChild(widgetZoneTop);

      // Iframe wrapper — takes all remaining vertical space
      const iframeWrapper = document.createElement('div');
      iframeWrapper.id = 'allchat-iframe-wrapper';
      iframeWrapper.style.cssText = 'flex: 1 1 0; min-height: 0;';
      container.appendChild(iframeWrapper);

      // Bottom widget zone — persistent channel points widget
      const widgetZoneBottom = document.createElement('div');
      widgetZoneBottom.id = 'allchat-widget-zone-bottom';
      widgetZoneBottom.setAttribute('role', 'region');
      widgetZoneBottom.setAttribute('aria-label', 'Twitch channel points');
      widgetZoneBottom.style.cssText = 'flex: 0 0 auto; overflow: hidden;';
      container.appendChild(widgetZoneBottom);

      slot.appendChild(container);

      // Wire tab switching — the tab bar handler calls hideNativeChat/showNativeChat
      setupTabSwitching(this);

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

      // Return iframeWrapper so injectAllChatUI places the iframe in the correct zone
      return iframeWrapper;
    } catch {
      console.warn('[AllChat Twitch] .chat-shell not found after timeout — native chat remains visible');
      return null;
    }
  }

  /**
   * Override to send TAB_BAR_MODE to the iframe after it loads,
   * so ChatContainer hides its own header in favour of the tab bar.
   */
  protected onIframeCreated(iframe: HTMLIFrameElement): void {
    iframe.addEventListener('load', () => {
      const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
      // T-07-03: use extensionOrigin as targetOrigin (not '*') when sending TAB_BAR_MODE
      iframe.contentWindow?.postMessage({ type: 'TAB_BAR_MODE', enabled: true }, extensionOrigin);
      console.log('[AllChat Twitch] Sent TAB_BAR_MODE to iframe');
    });
  }

  teardown(): void {
    // Remove tab bar in addition to base teardown
    const tabBar = document.getElementById('allchat-tab-bar');
    if (tabBar) {
      tabBar.remove();
    }
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
    if (platform === 'twitch') params.set('twitch_channel', streamer);
    window.location.href = chrome.runtime.getURL(`ui/chat-container.html?${params}`);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
  } else {
    document.body.appendChild(btn);
  }
}

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

  // Detect Twitch native pop-out chat: /popout/{channel}/chat
  const popoutMatch = window.location.pathname.match(/^\/popout\/([^/]+)\/chat/);
  if (popoutMatch) {
    const channel = popoutMatch[1];
    console.log(`[AllChat Twitch] Native pop-out detected for channel: ${channel}`);
    injectNativePopoutSwitchButton('twitch', channel, channel);
    return; // Do not inject full AllChat UI in native pop-out
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
 * Update the connection dot color in the tab bar based on connection state.
 */
function updateTabBarConnDot(state: string): void {
  const dot = document.getElementById('allchat-tab-conn-dot');
  if (!dot) return;

  switch (state) {
    case 'connected':
      dot.style.background = '#4ade80'; // green-400
      break;
    case 'connecting':
    case 'reconnecting':
      dot.style.background = '#facc15'; // yellow-400
      break;
    case 'failed':
      dot.style.background = '#f87171'; // red-400
      break;
    case 'disconnected':
    default:
      dot.style.background = 'oklch(0.35 0.007 270)'; // dim
      break;
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

      // Update connection dot in tab bar when CONNECTION_STATE arrives
      if (message.type === 'CONNECTION_STATE' && message.data?.state) {
        updateTabBarConnDot(message.data.state);
      }
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

    // Guard: only handle pop-out messages from the AllChat extension origin (T-06-09)
    if (event.origin !== extensionOrigin) return;

    // Handle pop-out request from AllChat iframe
    if (event.data.type === 'POPOUT_REQUEST' && globalDetector) {
      globalDetector.handlePopoutRequest(event.data);
    }

    // Handle "Switch to native" from AllChat iframe (D-14).
    // Routes through tab bar for Twitch to keep tab bar state consistent.
    if (event.data.type === 'SWITCH_TO_NATIVE' && globalDetector) {
      switchToTwitchTab(globalDetector);
    }

    // Handle "Switch to AllChat" from AllChat iframe
    if (event.data.type === 'SWITCH_TO_ALLCHAT' && globalDetector) {
      switchToAllChatTab(globalDetector);
    }

    // Handle "Bring back chat" / close pop-out from AllChat iframe
    if (event.data.type === 'CLOSE_POPOUT' && globalDetector) {
      globalDetector.closePopout();
      // Also notify iframe that popout is closed
      const iframes = document.querySelectorAll('iframe[data-platform="twitch"]');
      iframes.forEach((iframe) => {
        const el = iframe as HTMLIFrameElement;
        if (el.contentWindow) {
          el.contentWindow.postMessage({ type: 'POPOUT_CLOSED' }, extensionOrigin);
        }
      });
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
