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
 * Kick Content Script
 *
 * Handles All-Chat injection on Kick.com
 * URL format: kick.com/<username>
 *
 * Strategy: Full-panel toggle with tab bar.
 * A tab bar lets users switch between AllChat and native Kick chat.
 * When AllChat is active, all native Kick children are hidden.
 * When Kick Chat is active, AllChat is hidden and full native UI is restored.
 */

import { PlatformDetector } from './base/PlatformDetector';
import { createTabBar, setupTabSwitching, switchToNativeTab, switchToAllChatTab as switchToAllChatTabVisual, updateTabBarConnDot, removeTabBar, isLightMode, watchThemeChanges } from './base/tabBar';
import { getSyncStorage } from '../lib/storage';

// Guard observer — watches for Next.js removing our injected elements
let guardObserver: MutationObserver | null = null;

// ============================================================
// Kick Chat Sending — use Kick's own REST API with the viewer's
// existing session cookies. No AllChat auth required.
// ============================================================

/** Cache: channel slug → chatroom ID (required by the send endpoint). */
const kickChatroomIdCache = new Map<string, number>();

function getCookie(name: string): string | null {
  const cookie = document.cookie.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(name + '='));
  return cookie ? decodeURIComponent(cookie.substring(name.length + 1)) : null;
}

async function resolveKickChatroomId(slug: string): Promise<number> {
  const cached = kickChatroomIdCache.get(slug);
  if (cached) return cached;

  const resp = await fetch(`https://kick.com/api/v2/channels/${slug}`, { credentials: 'include' });
  if (!resp.ok) throw new Error(`Kick channel lookup failed: HTTP ${resp.status}`);
  const data = await resp.json();
  const id = data?.chatroom?.id;
  if (typeof id !== 'number') throw new Error(`Kick channel "${slug}" has no chatroom`);
  kickChatroomIdCache.set(slug, id);
  return id;
}

async function sendKickChatMessage(channelSlug: string, message: string): Promise<void> {
  const chatroomId = await resolveKickChatroomId(channelSlug);

  // Kick uses Laravel's XSRF protection on its web API.
  const xsrfToken = getCookie('XSRF-TOKEN');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (xsrfToken) headers['X-XSRF-TOKEN'] = xsrfToken;

  const resp = await fetch(`https://kick.com/api/v2/messages/send/${chatroomId}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ content: message, type: 'message' }),
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Not signed in to Kick — sign in to kick.com to send messages');
  }
  if (!resp.ok) {
    throw new Error(`Kick send failed: HTTP ${resp.status}`);
  }
}

/**
 * Activate the Kick Chat tab: hide AllChat, show native Kick chat.
 */
function handleSwitchToKick(): void {
  const container = document.getElementById('allchat-container');
  if (container) container.style.display = 'none';
  document.getElementById('allchat-hide-native-style')?.remove();
  switchToNativeTab();
  console.log('[AllChat Kick] Switched to Kick Chat tab');
}

/**
 * Activate the AllChat tab: show AllChat, hide native Kick chat.
 */
function handleSwitchToAllChat(detector: KickDetector): void {
  const container = document.getElementById('allchat-container');
  if (container) container.style.display = 'flex';
  detector.hideNativeChat();
  switchToAllChatTabVisual();
  console.log('[AllChat Kick] Switched to AllChat tab');
}

class KickDetector extends PlatformDetector {
  platform = 'kick' as const;

  /**
   * Check if the current page is a live stream via Kick API.
   * DOM-based live badge detection is not reliable on Kick (no stable selector as of 2026-03-12).
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

    const excluded = ['home', 'categories', 'search', 'subscriptions', 'settings', 'clip', 'clips'];
    if (excluded.includes(username.toLowerCase())) {
      return null;
    }

    return username;
  }

  getChatContainerSelector(): string[] {
    return [
      '#channel-chatroom',
    ];
  }

  hideNativeChat(): void {
    if (document.getElementById('allchat-hide-native-style')) return;

    // Surgical: hide ONLY the native message-list wrapper, marked with
    // data-allchat-msg-wrap="1" by createInjectionPoint. Leaves chat header
    // (settings, user count, dropdown menu), announcements strip, and
    // #chatroom-footer (input box, emote picker, send button, pinned
    // messages) visible so the viewer can still use every native Kick
    // chat feature even while AllChat is active.
    const style = document.createElement('style');
    style.id = 'allchat-hide-native-style';
    style.textContent = `
      #channel-chatroom [data-allchat-msg-wrap="1"] {
        display: none !important;
      }
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
    console.log('[AllChat Kick] Injected CSS to hide native message list');
  }

  showNativeChat(): void {
    const style = document.getElementById('allchat-hide-native-style');
    if (style) {
      style.remove();
      console.log('[AllChat Kick] Removed CSS, native message list restored');
    }
  }

  removeAllChatUI(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat Kick] Removed All-Chat UI');
    }
    removeTabBar();
    this.showNativeChat();
  }

  /**
   * Find the native message-list wrapper inside #channel-chatroom.
   * Kick (Next.js build, 2026-04) nests as:
   *   #channel-chatroom
   *     > chat-header   (flex min-h-[38px] …)
   *     > .relative.flex.flex-1.flex-col   (native body — STAYS)
   *         > .overflow-hidden               (pinned announcements)
   *         > .relative.shrink.grow.overflow-hidden.bg-surface-lowest  ← target
   *              > #chatroom-messages (the scrollable list)
   *         > #chatroom-footer               (input + emote picker + send)
   *
   * We only want to hide the message-list wrapper. Everything else is
   * native UI (settings button, emote picker, pinned messages, send
   * button, slow-mode badge …) and must remain visible.
   */
  private findMessageListWrapper(slot: HTMLElement): HTMLElement | null {
    const msgList = slot.querySelector('#chatroom-messages') as HTMLElement | null;
    const wrap = msgList?.parentElement as HTMLElement | null;
    if (wrap && slot.contains(wrap)) return wrap;
    return null;
  }

  async createInjectionPoint(): Promise<HTMLElement | null> {
    try {
      const slot = await this.waitForElement('#channel-chatroom');
      const msgWrap = this.findMessageListWrapper(slot);
      if (!msgWrap) {
        console.warn('[AllChat Kick] #chatroom-messages wrapper not found — aborting to avoid obscuring native UI');
        return null;
      }
      msgWrap.dataset.allchatMsgWrap = '1';

      // 1. Create and inject tab bar as a sibling directly above the
      //    message wrapper so it visually labels the switch between the
      //    two message feeds. Chat header (above) and chatroom-footer
      //    (below) stay untouched in their native positions.
      const tabBar = createTabBar('Kick Chat', 'kick');
      msgWrap.insertAdjacentElement('beforebegin', tabBar);

      // 2. Create #allchat-container as a sibling of the message wrapper,
      //    inheriting the same flex slot so it grows to the same height
      //    the native message list would have used.
      const container = document.createElement('div');
      container.id = 'allchat-container';
      container.style.cssText = 'flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;';
      msgWrap.insertAdjacentElement('afterend', container);

      // 3. Hide native message list — AllChat starts as active tab
      this.hideNativeChat();

      // 4. Wire tab switching
      const detector = this;
      setupTabSwitching(
        () => handleSwitchToKick(),
        () => handleSwitchToAllChat(detector),
      );

      // 4b. Watch for theme changes and update iframe
      watchThemeChanges('kick', (theme) => {
        const iframe = document.querySelector('#allchat-container iframe') as HTMLIFrameElement | null;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'TAB_BAR_MODE', enabled: true, hideInput: true, theme }, '*');
        }
      });

      // 5. Guard against Next.js re-renders removing our elements or
      //    swapping the message wrapper. When the wrapper is re-created
      //    we re-mark it and re-anchor our injected elements around it.
      guardObserver?.disconnect();
      const msgWrapParent = msgWrap.parentElement as HTMLElement | null;
      const reanchor = () => {
        const currentWrap = this.findMessageListWrapper(slot);
        if (!currentWrap) return;
        if (!currentWrap.dataset.allchatMsgWrap) currentWrap.dataset.allchatMsgWrap = '1';
        if (!currentWrap.parentElement) return;
        if (currentWrap.previousElementSibling !== tabBar) {
          currentWrap.insertAdjacentElement('beforebegin', tabBar);
        }
        if (currentWrap.nextElementSibling !== container) {
          currentWrap.insertAdjacentElement('afterend', container);
        }
      };
      guardObserver = new MutationObserver(() => {
        if (!document.contains(slot)) return;
        const wrapStillThere = this.findMessageListWrapper(slot);
        if (!wrapStillThere) return;
        if (wrapStillThere.previousElementSibling !== tabBar || wrapStillThere.nextElementSibling !== container) {
          console.log('[AllChat Kick] Anchor disturbed — re-anchoring around message wrapper');
          reanchor();
        }
      });
      if (msgWrapParent) {
        guardObserver.observe(msgWrapParent, { childList: true });
      }
      guardObserver.observe(slot, { childList: true, subtree: true });

      return container;
    } catch {
      console.warn('[AllChat Kick] #channel-chatroom not found — native chat remains visible');
      return null;
    }
  }

  protected onIframeCreated(iframe: HTMLIFrameElement): void {
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.postMessage({ type: 'TAB_BAR_MODE', enabled: true, hideInput: true, theme: isLightMode('kick') ? 'light' : 'dark' }, '*');
      console.log('[AllChat Kick] Sent TAB_BAR_MODE to iframe');
    });
  }

  teardown(): void {
    removeTabBar();
    guardObserver?.disconnect();
    guardObserver = null;
    // Clear the marker so a fresh injection on URL change starts clean.
    document.querySelectorAll('#channel-chatroom [data-allchat-msg-wrap="1"]').forEach((el) => {
      delete (el as HTMLElement).dataset.allchatMsgWrap;
    });
    this.showNativeChat();
    super.teardown();
  }
}

// Store detector instance globally
let globalDetector: KickDetector | null = null;

// Guard against duplicate message relay registration
let messageRelaySetup = false;

function handleExtensionStateChange(enabled: boolean) {
  console.log(`[AllChat Kick] Extension state changed: ${enabled ? 'enabled' : 'disabled'}`);

  if (!enabled) {
    if (globalDetector) {
      globalDetector.teardown();
      globalDetector = null;
    }
  } else {
    if (!globalDetector) {
      globalDetector = new KickDetector();
      setupGlobalMessageRelay();
      globalDetector.init();
      setupUrlWatcher();
    }
  }
}

async function initialize() {
  console.log('[AllChat Kick] Content script loaded');

  const settings = await getSyncStorage();
  if (!settings.platformEnabled.kick) {
    console.log('[AllChat Kick] Extension disabled for Kick, not injecting');
    setupGlobalMessageRelay();
    return;
  }

  globalDetector = new KickDetector();

  chrome.runtime.sendMessage({ type: 'SET_CURRENT_PLATFORM', platform: 'kick' }).catch((err: unknown) => {
    console.warn('[AllChat Kick] Failed to write current_platform to session:', err);
  });

  setupGlobalMessageRelay();
  globalDetector.init();
  setupUrlWatcher();
}

function setupGlobalMessageRelay() {
  if (messageRelaySetup) return;
  messageRelaySetup = true;

  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    console.log('[AllChat Kick] Received from service worker:', message.type);

    if (message.type === 'EXTENSION_STATE_CHANGED') {
      handleExtensionStateChange(message.enabled);
      return false;
    }

    if (message.type === 'CONNECTION_STATE' || message.type === 'WS_MESSAGE') {
      const iframes = document.querySelectorAll('iframe[data-platform="kick"][data-streamer]');

      iframes.forEach((iframe) => {
        const iframeElement = iframe as HTMLIFrameElement;
        const iframeStreamer = iframeElement.getAttribute('data-streamer');
        if (message.streamer && iframeStreamer && message.streamer !== iframeStreamer) {
          return;
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

  window.addEventListener('message', async (event) => {
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);

    if (event.data.type === 'GET_CONNECTION_STATE') {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATE' });
      if (response.success && event.source) {
        (event.source as Window).postMessage({
          type: 'CONNECTION_STATE',
          data: response.data
        }, extensionOrigin);
      }
    }

    if (event.data.type === 'OPEN_VIEWER_CARD' && event.data.username) {
      window.open(`https://kick.com/${event.data.username}`, '_blank');
    }

    // Native chat sending via Kick's own REST API
    if (event.data.type === 'SEND_NATIVE_CHAT' && event.data.message && event.source) {
      const source = event.source as Window;
      const channel = globalDetector?.extractStreamerUsername();
      (async () => {
        try {
          if (!channel) throw new Error('Could not determine channel');
          await sendKickChatMessage(channel, event.data.message);
          source.postMessage({ type: 'SEND_NATIVE_CHAT_RESULT', success: true }, extensionOrigin);
        } catch (err: unknown) {
          console.error('[AllChat Kick] Native send failed:', err);
          source.postMessage({
            type: 'SEND_NATIVE_CHAT_RESULT',
            success: false,
            error: err instanceof Error ? err.message : 'Failed to send message',
          }, extensionOrigin);
        }
      })();
    }

    if (event.origin !== extensionOrigin) return;

    if (event.data.type === 'POPOUT_REQUEST' && globalDetector) {
      globalDetector.handlePopoutRequest(event.data);
    }

    if (event.data.type === 'SWITCH_TO_NATIVE' && globalDetector) {
      handleSwitchToKick();
    }

    if (event.data.type === 'SWITCH_TO_ALLCHAT' && globalDetector) {
      handleSwitchToAllChat(globalDetector);
    }

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

function setupUrlWatcher(): void {
  let activeUrl = location.href;

  const handleNavigation = async () => {
    const url = location.href;
    if (url === activeUrl) return;
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

  window.addEventListener('popstate', handleNavigation);

  new MutationObserver(handleNavigation).observe(
    document.querySelector('title') || document.head,
    { childList: true, characterData: true, subtree: true }
  );
}

initialize();
