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
 * Twitch Content Script
 *
 * Handles All-Chat injection on Twitch.tv
 * URL format: twitch.tv/username
 *
 * Strategy: Surgical message-list replacement.
 * Instead of replacing the entire chat panel and cloning widgets back,
 * we inject the AllChat iframe as a sibling of the native message list
 * (.chat-list--default) inside .chat-room__content. All native Twitch
 * features (channel points, emote picker, leaderboard, predictions, etc.)
 * remain untouched in their original DOM positions.
 */

import { PlatformDetector } from './base/PlatformDetector';
import { createTabBar, setupTabSwitching, switchToNativeTab, switchToAllChatTab as switchToAllChatTabVisual, updateTabBarConnDot, removeTabBar, isLightMode, watchThemeChanges } from './base/tabBar';
import { getSyncStorage } from '../lib/storage';

// Module-level slot observer — shared between createInjectionPoint and teardown
let slotObserver: MutationObserver | null = null;

// Guard observer — watches for React removing our injected elements
let guardObserver: MutationObserver | null = null;

// Store detector instance globally so message relay can access it
let globalDetector: TwitchDetector | null = null;

// Track last checked streamer to avoid redundant re-injections
let lastCheckedStreamer: string | null = null;

// Guard against duplicate message relay registration
let messageRelaySetup = false;

// ============================================================
// Twitch Chat Sending — use Twitch's own GraphQL API with the
// viewer's existing auth-token cookie. No AllChat auth required.
// ============================================================

const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
/** Public client ID Twitch's own frontend uses. Safe to hardcode. */
const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

/** Cache: channel login name → numeric channel ID (required by sendChatMessage). */
const twitchChannelIdCache = new Map<string, string>();

function getTwitchAuthToken(): string | null {
  const cookie = document.cookie.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('auth-token='));
  return cookie ? cookie.substring('auth-token='.length) : null;
}

async function twitchGql<T = unknown>(authToken: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const resp = await fetch(TWITCH_GQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `OAuth ${authToken}`,
      'Client-Id': TWITCH_WEB_CLIENT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`Twitch GraphQL HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.errors?.length) {
    throw new Error(data.errors.map((e: { message: string }) => e.message).join('; '));
  }
  return data.data as T;
}

async function resolveTwitchChannelId(authToken: string, login: string): Promise<string> {
  const key = login.toLowerCase();
  const cached = twitchChannelIdCache.get(key);
  if (cached) return cached;

  const data = await twitchGql<{ user: { id: string } | null }>(
    authToken,
    'query($login: String!) { user(login: $login) { id } }',
    { login: key },
  );
  if (!data.user?.id) throw new Error(`Twitch channel "${login}" not found`);
  twitchChannelIdCache.set(key, data.user.id);
  return data.user.id;
}

async function sendTwitchChatMessage(channelLogin: string, message: string): Promise<void> {
  const authToken = getTwitchAuthToken();
  if (!authToken) {
    throw new Error('Not signed in to Twitch — sign in to twitch.tv to send messages');
  }

  const channelID = await resolveTwitchChannelId(authToken, channelLogin);
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);

  await twitchGql(
    authToken,
    'mutation SendChat($input: SendChatMessageInput!) { sendChatMessage(input: $input) { __typename } }',
    { input: { channelID, message, nonce } },
  );
}

/**
 * Find the native message list element inside .chat-room__content.
 * This is the flex-growing child that contains the scrollable chat messages.
 * Selector: .chat-list--default (stable class used by Twitch since 2024+).
 */
function findNativeMessageList(chatShell: HTMLElement): HTMLElement | null {
  // Primary: stable class selector
  const byClass = chatShell.querySelector('.chat-list--default') as HTMLElement | null;
  if (byClass) return byClass;

  // Fallback: find the flex-growing child of .chat-room__content
  const content = chatShell.querySelector('.chat-room__content') as HTMLElement | null;
  if (!content) return null;

  for (const child of Array.from(content.children)) {
    const style = window.getComputedStyle(child as HTMLElement);
    if (style.flexGrow === '1' && (child as HTMLElement).offsetHeight > 0) {
      return child as HTMLElement;
    }
  }
  return null;
}

/**
 * Activate the Twitch Chat tab: hide AllChat iframe, show native message list.
 */
function handleSwitchToTwitch(): void {
  const container = document.getElementById('allchat-container');
  if (container) container.style.display = 'none';
  // Show native message list by removing the hide style
  document.getElementById('allchat-hide-native-style')?.remove();
  switchToNativeTab();
  console.log('[AllChat Twitch] Switched to Twitch Chat tab');
}

/**
 * Activate the AllChat tab: show AllChat iframe, hide native message list.
 */
function handleSwitchToAllChat(detector: TwitchDetector): void {
  const container = document.getElementById('allchat-container');
  if (container) container.style.display = 'flex';
  detector.hideNativeChat();
  switchToAllChatTabVisual();
  console.log('[AllChat Twitch] Switched to AllChat tab');
}

class TwitchDetector extends PlatformDetector {
  platform = 'twitch' as const;

  extractStreamerUsername(): string | null {
    const pathname = window.location.pathname;

    // Handle Twitch pop-out chat URL: /popout/{channel}/chat
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
    return [
      '[data-test-selector="chat-scrollable-area"]',
      'div[role="log"]',
      '.chat-scrollable-area__message-container',
      '.chat-shell',
      '.right-column',
      '[data-a-target="right-column-chat-bar"]',
    ];
  }

  hideNativeChat(): void {
    // Use a <style> tag with !important to reliably hide the native message list.
    // Inline styles get overwritten by React re-renders; a <style> tag persists.
    // We hide ONLY the message list — channel points, emotes, leaderboard stay visible.
    if (document.getElementById('allchat-hide-native-style')) return;

    const style = document.createElement('style');
    style.id = 'allchat-hide-native-style';
    style.textContent = `
      /* Hide the native message list (the only flex-growing child of .chat-room__content) */
      .chat-list--default,
      .chat-room__content > [class*="chat-list"] {
        display: none !important;
      }
      /* Ensure AllChat container fills the space */
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
    console.log('[AllChat Twitch] Injected CSS to hide native message list');
  }

  showNativeChat(): void {
    // Remove the hiding style to restore native message list
    const style = document.getElementById('allchat-hide-native-style');
    if (style) {
      style.remove();
      console.log('[AllChat Twitch] Removed CSS, native message list restored');
    }
  }

  removeAllChatUI(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat Twitch] Removed All-Chat UI');
    }
    removeTabBar();
    removeViewerCardOverlay();
    this.showNativeChat();
  }

  teardown(): void {
    removeTabBar();
    removeViewerCardOverlay();
    guardObserver?.disconnect();
    guardObserver = null;
    slotObserver?.disconnect();
    slotObserver = null;
    this.showNativeChat();
    super.teardown();
  }

  async createInjectionPoint(): Promise<HTMLElement | null> {
    try {
      // Wait for .chat-shell — on offline channels it appears after "Chat" tab click
      const chatShell = await this.waitForElement('.chat-shell', 60_000);

      // Find the critical DOM elements
      const streamChat = chatShell.querySelector('.stream-chat') as HTMLElement | null;
      const chatRoomContent = chatShell.querySelector('.chat-room__content') as HTMLElement | null;
      const nativeMsgList = findNativeMessageList(chatShell);

      if (!streamChat || !chatRoomContent || !nativeMsgList) {
        console.warn('[AllChat Twitch] Could not find required DOM elements:', {
          streamChat: !!streamChat,
          chatRoomContent: !!chatRoomContent,
          nativeMsgList: !!nativeMsgList,
        });
        return null;
      }

      // 1. Create and inject tab bar between .stream-chat-header and section.chat-room
      const tabBar = createTabBar('Twitch Chat', 'twitch');
      const chatRoom = streamChat.querySelector('section.chat-room, [data-test-selector="chat-room-component-layout"]');
      if (chatRoom) {
        streamChat.insertBefore(tabBar, chatRoom);
      } else {
        streamChat.appendChild(tabBar);
      }

      // 2. Create #allchat-container as a flex child of .chat-room__content
      //    It takes the same flex space as .chat-list--default (flex: 1 1 auto)
      const container = document.createElement('div');
      container.id = 'allchat-container';
      container.style.cssText = 'flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;';

      // Insert after the native message list so it occupies the same position
      nativeMsgList.insertAdjacentElement('afterend', container);

      // 3. Hide native message list — AllChat starts as active tab
      this.hideNativeChat();

      // 4. Wire tab switching
      const detector = this;
      setupTabSwitching(
        () => handleSwitchToTwitch(),
        () => handleSwitchToAllChat(detector),
      );

      // 4b. Watch for light/dark theme changes and update iframe
      watchThemeChanges('twitch', (theme) => {
        const iframe = document.querySelector('#allchat-container iframe') as HTMLIFrameElement | null;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'TAB_BAR_MODE', enabled: true, hideInput: true, theme }, '*');
        }
      });

      // 5. Guard against React reconciliation removing our elements
      guardObserver?.disconnect();
      guardObserver = new MutationObserver(() => {
        if (!chatRoomContent.contains(container) && document.contains(chatRoomContent)) {
          console.log('[AllChat Twitch] Container removed by React — re-injecting');
          const msgList = findNativeMessageList(chatShell);
          if (msgList) {
            msgList.insertAdjacentElement('afterend', container);
          }
        }
        if (!streamChat.contains(tabBar) && document.contains(streamChat)) {
          console.log('[AllChat Twitch] Tab bar removed by React — re-injecting');
          const room = streamChat.querySelector('section.chat-room, [data-test-selector="chat-room-component-layout"]');
          if (room) {
            streamChat.insertBefore(tabBar, room);
          }
        }
      });
      guardObserver.observe(chatRoomContent, { childList: true });
      guardObserver.observe(streamChat, { childList: true });

      // 6. Slot observer — detect .chat-shell removal (SPA navigation)
      if (chatShell.parentElement) {
        slotObserver?.disconnect();
        slotObserver = new MutationObserver(() => {
          const slotExists = chatShell.parentElement?.querySelector('.chat-shell');
          const containerExists = document.getElementById('allchat-container');
          if (!slotExists && !containerExists && globalDetector) {
            console.log('[AllChat Twitch] .chat-shell removed, re-running init...');
            guardObserver?.disconnect();
            globalDetector.init();
          }
        });
        slotObserver.observe(chatShell.parentElement, { childList: true, subtree: false });
      }

      // Return container — base class will append the iframe here
      return container;
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
      iframe.contentWindow?.postMessage({ type: 'TAB_BAR_MODE', enabled: true, hideInput: true, theme: isLightMode('twitch') ? 'light' : 'dark' }, '*');
      console.log('[AllChat Twitch] Sent TAB_BAR_MODE to iframe');
    });
  }

}

/**
 * Inject "Switch to AllChat" button into native platform pop-out chat.
 * Clicking navigates the pop-out window to AllChat's chat-container.html.
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
    return;
  }

  globalDetector = new TwitchDetector();

  // Set up message relay IMMEDIATELY (before any async operations)
  setupGlobalMessageRelay();

  // Signal to popup which platform page the user is on
  chrome.runtime.sendMessage({ type: 'SET_CURRENT_PLATFORM', platform: 'twitch' }).catch((err: unknown) => {
    console.warn('[AllChat Twitch] Failed to write current_platform to session:', err);
  });

  // Wait for chat to load
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
    if (!globalDetector) {
      globalDetector = new TwitchDetector();
      setupGlobalMessageRelay();
      globalDetector.init();
      setupUrlWatcher();
      setupChatTabWatcher();
    }
  }
}

// updateTabBarConnDot imported from ./base/tabBar

/** Remove any existing AllChat viewer card overlay. */
function removeViewerCardOverlay(): void {
  document.getElementById('allchat-viewer-card-overlay')?.remove();
  document.getElementById('allchat-viewer-card-backdrop')?.remove();
}

/** Show a Twitch viewer card as an iframe overlay on the page. */
function showViewerCardOverlay(channel: string, username: string): void {
  removeViewerCardOverlay();

  const backdrop = document.createElement('div');
  backdrop.id = 'allchat-viewer-card-backdrop';
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.3);';
  backdrop.addEventListener('click', removeViewerCardOverlay);

  const overlay = document.createElement('div');
  overlay.id = 'allchat-viewer-card-overlay';
  overlay.style.cssText =
    'position:fixed;z-index:99999;width:340px;height:500px;border-radius:8px;overflow:hidden;' +
    'box-shadow:0 8px 32px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.1);background:#18181b;';

  const chatShell = document.querySelector('.chat-shell') as HTMLElement | null;
  if (chatShell) {
    const rect = chatShell.getBoundingClientRect();
    const top = Math.max(8, rect.top + (rect.height - 500) / 2);
    const left = Math.max(8, rect.left - 340 - 8);
    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
  } else {
    overlay.style.top = '50%';
    overlay.style.left = '50%';
    overlay.style.transform = 'translate(-50%,-50%)';
  }

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText =
    'position:absolute;top:4px;right:4px;z-index:1;width:28px;height:28px;border-radius:50%;' +
    'background:rgba(0,0,0,0.6);border:none;color:#efeff1;cursor:pointer;font-size:16px;' +
    'display:flex;align-items:center;justify-content:center;';
  closeBtn.innerHTML = '&times;';
  closeBtn.title = 'Close viewer card';
  closeBtn.addEventListener('click', removeViewerCardOverlay);

  const iframe = document.createElement('iframe');
  iframe.src = `https://www.twitch.tv/popout/${channel}/viewercard/${username}`;
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  iframe.title = `Viewer card for ${username}`;

  overlay.appendChild(closeBtn);
  overlay.appendChild(iframe);
  document.body.appendChild(backdrop);
  document.body.appendChild(overlay);

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      removeViewerCardOverlay();
      document.removeEventListener('keydown', handleKeydown);
    }
  };
  document.addEventListener('keydown', handleKeydown);
}

/**
 * Set up global message relay from service worker to iframe.
 * Called immediately when content script loads to avoid missing messages.
 */
function setupGlobalMessageRelay() {
  if (messageRelaySetup) return;
  messageRelaySetup = true;

  // Listen for messages FROM service worker TO iframes
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[AllChat Twitch] Received from service worker:', message.type);

    if (message.type === 'EXTENSION_STATE_CHANGED') {
      handleExtensionStateChange(message.enabled);
      return false;
    }

    if (message.type === 'CONNECTION_STATE' || message.type === 'WS_MESSAGE') {
      const iframes = document.querySelectorAll('iframe[data-platform="twitch"][data-streamer]');

      iframes.forEach((iframe) => {
        const iframeElement = iframe as HTMLIFrameElement;
        // Only relay to iframes whose streamer matches the message's streamer
        const iframeStreamer = iframeElement.getAttribute('data-streamer');
        if (message.streamer && iframeStreamer && message.streamer !== iframeStreamer) {
          return; // Skip — this message is for a different streamer
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

  // Listen for messages FROM iframes
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

    if (event.data.type === 'OPEN_VIEWER_CARD' && globalDetector) {
      const channel = globalDetector.extractStreamerUsername();
      if (channel && event.data.username) {
        showViewerCardOverlay(channel, event.data.username);
      }
    }

    // Native chat sending via Twitch's own GraphQL API
    if (event.data.type === 'SEND_NATIVE_CHAT' && event.data.message && event.source) {
      const source = event.source as Window;
      const channel = globalDetector?.extractStreamerUsername();
      (async () => {
        try {
          if (!channel) throw new Error('Could not determine channel');
          await sendTwitchChatMessage(channel, event.data.message);
          source.postMessage({ type: 'SEND_NATIVE_CHAT_RESULT', success: true }, extensionOrigin);
        } catch (err: unknown) {
          console.error('[AllChat Twitch] Native send failed:', err);
          source.postMessage({
            type: 'SEND_NATIVE_CHAT_RESULT',
            success: false,
            error: err instanceof Error ? err.message : 'Failed to send message',
          }, extensionOrigin);
        }
      })();
    }

    // Guard: only handle pop-out messages from the AllChat extension origin
    if (event.origin !== extensionOrigin) return;

    if (event.data.type === 'POPOUT_REQUEST' && globalDetector) {
      globalDetector.handlePopoutRequest(event.data);
    }

    // Route switch-to-native through tab bar
    if (event.data.type === 'SWITCH_TO_NATIVE' && globalDetector) {
      handleSwitchToTwitch();
    }

    if (event.data.type === 'SWITCH_TO_ALLCHAT' && globalDetector) {
      handleSwitchToAllChat(globalDetector);
    }

    if (event.data.type === 'CLOSE_POPOUT' && globalDetector) {
      globalDetector.closePopout();
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
 * Watch for URL changes (Twitch uses client-side routing).
 * Calls teardown() immediately on URL change before re-calling init().
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
 * Re-runs init() when the tab is clicked so injection can proceed.
 */
function setupChatTabWatcher() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
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
