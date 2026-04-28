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
 * Base Platform Detector
 *
 * Abstract class that all platform-specific content scripts extend.
 * Handles common logic for:
 * - Extracting streamer username from URL
 * - Checking if streamer exists in All-Chat
 * - Hiding native chat and injecting All-Chat UI
 */

import { ExtensionMessage, ExtensionResponse, StreamerInfo } from '../../lib/types/extension';
import {
  PopoutRequestMessage,
  POPOUT_DEFAULTS,
  POPOUT_MESSAGE_BUFFER_KEY,
  POPOUT_CLOSE_POLL_MS,
} from '../../lib/types/popout';

export abstract class PlatformDetector {
  abstract platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';

  /** Reference to the open pop-out window (null if none open) */
  protected popoutWindow: Window | null = null;
  /** Interval ID for polling pop-out window.closed */
  private popoutPollInterval: ReturnType<typeof setInterval> | null = null;
  /** Whether AllChat is currently hidden in favor of native chat (D-14) */
  protected allchatHidden = false;

  /**
   * Extract streamer username from current page URL
   */
  abstract extractStreamerUsername(): string | null;

  /**
   * Get CSS selector for native chat container
   */
  abstract getChatContainerSelector(): string[];

  /**
   * Hide native chat element
   */
  abstract hideNativeChat(): void;

  /**
   * Show native chat element (restore visibility)
   */
  abstract showNativeChat(): void;

  /**
   * Remove All-Chat UI from the page
   */
  abstract removeAllChatUI(): void;

  /**
   * Create injection point for All-Chat UI
   */
  abstract createInjectionPoint(): Promise<HTMLElement | null>;

  /**
   * Wait for a DOM element matching selector to appear.
   * Polls every pollIntervalMs after an initial preDelayMs delay.
   * Rejects if the element is not found within timeoutMs.
   */
  public waitForElement(
    selector: string,
    timeoutMs = 10_000,
    preDelayMs = 200,
    pollIntervalMs = 100
  ): Promise<HTMLElement> {
    return new Promise<HTMLElement>((resolve, reject) => {
      setTimeout(() => {
        const immediate = document.querySelector(selector) as HTMLElement | null;
        if (immediate) {
          resolve(immediate);
          return;
        }

        const deadline = Date.now() + timeoutMs - preDelayMs;
        const interval = setInterval(() => {
          const el = document.querySelector(selector) as HTMLElement | null;
          if (el) {
            clearInterval(interval);
            resolve(el);
          } else if (Date.now() >= deadline) {
            clearInterval(interval);
            reject(new Error(`[AllChat] waitForElement: "${selector}" not found after ${timeoutMs}ms`));
          }
        }, pollIntervalMs);
      }, preDelayMs);
    });
  }

  /**
   * Remove All-Chat UI from the page and restore native chat.
   * Subclasses may override and call super.teardown() for extra cleanup.
   */
  teardown(): void {
    // Clean up pop-out polling
    if (this.popoutPollInterval) {
      clearInterval(this.popoutPollInterval);
      this.popoutPollInterval = null;
    }
    // Remove switch button if present
    this.removeSwitchToAllChatButton();
    this.allchatHidden = false;

    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
    }

    const style = document.getElementById('allchat-hide-native-style');
    if (style) {
      style.remove();
    }

    this.showNativeChat();
    console.log(`[AllChat ${this.platform}] Teardown complete`);
  }

  /**
   * Handle POPOUT_REQUEST from the AllChat iframe.
   * Writes message buffer to chrome.storage.local (D-08), reads persisted
   * window dimensions (D-07), opens the pop-out window (D-04), and starts
   * close polling (D-10).
   */
  async handlePopoutRequest(data: PopoutRequestMessage): Promise<void> {
    // Prevent opening multiple pop-outs — guarded against Firefox dead-object
    // throws on the cross-compartment Window wrapper.
    let alreadyOpen = false;
    try {
      alreadyOpen = !!this.popoutWindow && !this.popoutWindow.closed;
    } catch { alreadyOpen = false; }
    if (alreadyOpen) {
      try { this.popoutWindow!.focus(); } catch { /* dead object */ }
      return;
    }
    this.popoutWindow = null;

    // D-08: Write message buffer to storage before opening window
    if (data.messages && data.messages.length > 0) {
      try {
        await chrome.storage.local.set({
          [POPOUT_MESSAGE_BUFFER_KEY]: JSON.stringify(data.messages),
        });
        console.log(`[AllChat ${this.platform}] Wrote ${data.messages.length} messages to pop-out buffer`);
      } catch (err) {
        console.error(`[AllChat ${this.platform}] Failed to write pop-out buffer:`, err);
      }
    }

    // D-07: Read persisted window dimensions
    const storage = await chrome.storage.local.get([
      'popout_window_width', 'popout_window_height', 'popout_window_x', 'popout_window_y',
    ]);
    const w = (storage.popout_window_width as number | undefined) ?? POPOUT_DEFAULTS.width;
    const h = (storage.popout_window_height as number | undefined) ?? POPOUT_DEFAULTS.height;
    const x = (storage.popout_window_x as number | undefined) ?? POPOUT_DEFAULTS.x;
    const y = (storage.popout_window_y as number | undefined) ?? POPOUT_DEFAULTS.y;

    // Clamp to screen bounds (prevents off-screen placement after display config change)
    const clampedX = Math.max(0, Math.min(x, screen.width - w));
    const clampedY = Math.max(0, Math.min(y, screen.height - h));

    // Build pop-out URL with params
    const params = new URLSearchParams({
      platform: data.platform,
      streamer: data.streamer,
      display_name: data.displayName,
      popout: '1',
    });
    if (data.twitchChannel) {
      params.set('twitch_channel', data.twitchChannel);
    }
    if (data.videoId) {
      params.set('video_id', data.videoId);
    }
    const popoutUrl = chrome.runtime.getURL(`ui/chat-container.html?${params}`);

    // D-04: Open pop-out window via window.open (no new permissions needed)
    // D-06: Standard window (no always-on-top)
    this.popoutWindow = window.open(
      popoutUrl,
      'AllChatPopOut',
      `width=${w},height=${h},left=${clampedX},top=${clampedY}`,
    );

    if (!this.popoutWindow) {
      console.error(`[AllChat ${this.platform}] Failed to open pop-out window (popup blocked?)`);
      return;
    }

    // Notify iframe that pop-out is open (D-05 triggers banner)
    const iframe = document.querySelector('iframe[data-platform]') as HTMLIFrameElement | null;
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'POPOUT_OPENED' }, extensionOrigin);
    }

    // D-07: Save dimensions periodically while pop-out is open (beforeunload unreliable)
    // D-10: Poll for pop-out window close
    this.startPopoutPolling(iframe, extensionOrigin);
  }

  /**
   * Poll the pop-out window to:
   * - Save dimensions every 2s (D-07)
   * - Detect close and restore in-page AllChat (D-10)
   *
   * On Firefox, `window.open()` from a content script returns a cross-compartment
   * wrapper that typically becomes a "dead object" before the first tick fires —
   * any property access (including `.closed`) throws. The port-disconnect path in
   * the service worker is the authoritative close signal on Firefox; polling here
   * stays for Chrome's dimension persistence only, with every access guarded.
   */
  private startPopoutPolling(iframe: HTMLIFrameElement | null, extensionOrigin: string): void {
    if (this.popoutPollInterval) {
      clearInterval(this.popoutPollInterval);
    }

    let dimensionSaveCounter = 0;

    this.popoutPollInterval = setInterval(() => {
      let isClosed = false;
      let deadReference = false;
      try {
        isClosed = !this.popoutWindow || this.popoutWindow.closed;
      } catch {
        // Firefox "can't access dead object": the Window wrapper is unusable.
        // Close detection in this environment is driven by SW port-disconnect,
        // so stop polling rather than spamming the console.
        deadReference = true;
      }

      if (deadReference) {
        clearInterval(this.popoutPollInterval!);
        this.popoutPollInterval = null;
        return;
      }

      if (isClosed) {
        clearInterval(this.popoutPollInterval!);
        this.popoutPollInterval = null;
        this.popoutWindow = null;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'POPOUT_CLOSED' }, extensionOrigin);
        }
        console.log(`[AllChat ${this.platform}] Pop-out window closed, restored in-page chat`);
        return;
      }

      dimensionSaveCounter++;
      if (dimensionSaveCounter >= 4) {
        dimensionSaveCounter = 0;
        try {
          chrome.storage.local.set({
            popout_window_width: this.popoutWindow!.outerWidth,
            popout_window_height: this.popoutWindow!.outerHeight,
            popout_window_x: this.popoutWindow!.screenX,
            popout_window_y: this.popoutWindow!.screenY,
          });
        } catch {
          // Cross-origin / dead-object access — SW broadcast persists dims elsewhere on Firefox.
        }
      }
    }, POPOUT_CLOSE_POLL_MS);
  }

  /**
   * Close the pop-out window programmatically (e.g., "Bring back chat" button).
   *
   * On Firefox the `window.open()` return value is a dead cross-compartment
   * wrapper: even reading `.closed` throws. We therefore do NOT rely on the
   * reference at all — the service worker broadcasts POPOUT_SELF_CLOSE over
   * the pop-out port and the pop-out closes itself (self-close on a
   * script-opened window is always permitted). The direct `.close()` stays
   * only as a Chrome fast path, fully guarded.
   */
  closePopout(): void {
    let isOpen = false;
    try {
      isOpen = !!this.popoutWindow && !this.popoutWindow.closed;
    } catch { /* Firefox dead object — skip the Chrome fast path */ }

    if (isOpen) {
      try {
        chrome.storage.local.set({
          popout_window_width: this.popoutWindow!.outerWidth,
          popout_window_height: this.popoutWindow!.outerHeight,
          popout_window_x: this.popoutWindow!.screenX,
          popout_window_y: this.popoutWindow!.screenY,
        });
      } catch { /* ignore */ }
      try { this.popoutWindow!.close(); } catch { /* restricted — SW broadcast below */ }
    }

    chrome.runtime.sendMessage({ type: 'CLOSE_POPOUT_WINDOWS' }).catch(() => { /* best-effort */ });

    this.popoutWindow = null;
    if (this.popoutPollInterval) {
      clearInterval(this.popoutPollInterval);
      this.popoutPollInterval = null;
    }
  }

  /**
   * Called when the service worker reports that the pop-out port disconnected
   * (Firefox-authoritative close detection). Restores in-page AllChat state
   * without touching the dead `popoutWindow` reference.
   */
  notifyPopoutClosedExternally(iframeSelector: string): void {
    this.popoutWindow = null;
    if (this.popoutPollInterval) {
      clearInterval(this.popoutPollInterval);
      this.popoutPollInterval = null;
    }
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
    document.querySelectorAll(iframeSelector).forEach((iframe) => {
      const el = iframe as HTMLIFrameElement;
      if (el.contentWindow) {
        el.contentWindow.postMessage({ type: 'POPOUT_CLOSED' }, extensionOrigin);
      }
    });
  }

  /**
   * Handle "Switch to native" request from in-page AllChat iframe (D-14).
   * Hides AllChat and shows native chat. Injects "Switch to AllChat" button into native chat.
   * When a tab bar exists (Twitch), the tab bar handles view switching — skip button injection.
   */
  handleSwitchToNative(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.style.display = 'none';
      this.allchatHidden = true;
    }
    this.showNativeChat();
    // Only inject the fallback button if no tab bar exists (Twitch uses tab bar instead)
    if (!document.getElementById('allchat-tab-bar')) {
      this.injectSwitchToAllChatButton();
    }
    console.log(`[AllChat ${this.platform}] Switched to native chat (AllChat hidden)`);
  }

  /**
   * Handle "Switch to AllChat" — restore AllChat iframe and hide native chat (D-14 reverse).
   * When a tab bar exists (Twitch), the tab bar handles view switching — skip button removal.
   */
  handleSwitchToAllChat(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.style.display = '';
      this.allchatHidden = false;
    }
    this.hideNativeChat();
    // Only remove the fallback button if no tab bar exists
    if (!document.getElementById('allchat-tab-bar')) {
      this.removeSwitchToAllChatButton();
    }
    console.log(`[AllChat ${this.platform}] Switched back to AllChat`);
  }

  /**
   * Inject a "Switch to AllChat" button into the native chat area (D-14).
   * Content scripts can override for platform-specific DOM targets.
   */
  protected injectSwitchToAllChatButton(): void {
    if (document.getElementById('allchat-switch-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'allchat-switch-btn';
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
      this.handleSwitchToAllChat();
    });
    document.body.appendChild(btn);
  }

  /**
   * Remove the "Switch to AllChat" button from native chat.
   */
  protected removeSwitchToAllChatButton(): void {
    const btn = document.getElementById('allchat-switch-btn');
    if (btn) btn.remove();
  }

  /**
   * Initialize All-Chat on this platform.
   * @param displayNameResolver Optional function to resolve a human-readable
   *   display name from the raw username (e.g. channel ID → channel title).
   */
  async init(displayNameResolver?: (username: string) => string): Promise<void> {
    console.log(`[AllChat ${this.platform}] Initializing...`);

    const username = this.extractStreamerUsername();
    if (!username) {
      console.log(`[AllChat ${this.platform}] Could not extract streamer username`);
      return;
    }

    console.log(`[AllChat ${this.platform}] Detected streamer: ${username}`);

    // Check if streamer exists in All-Chat
    try {
      const streamerInfo = await this.checkStreamerExists(username);
      if (!streamerInfo) {
        console.log(`[AllChat ${this.platform}] Streamer not in database, showing native chat`);
        this.showNotConfiguredBadge(username);
        return;
      }

      console.log(`[AllChat ${this.platform}] Streamer found! Has ${streamerInfo.platforms.length} active platform(s)`);

      // Clean up existing UI before creating new one (fixes streamer switching bug)
      this.removeAllChatUI();

      // Hide native chat and inject All-Chat
      this.hideNativeChat();
      const container = await this.createInjectionPoint();
      if (!container) {
        console.error(`[AllChat ${this.platform}] Failed to create injection point`);
        return;
      }

      // Use the display name from the backend API (streamerInfo.display_name) as the
      // primary source; fall back to the platform-specific displayNameResolver (e.g.
      // YouTube DOM scraping) or the raw username. The backend display_name is the most
      // reliable because it doesn't depend on DOM load timing.
      const displayName = streamerInfo.display_name
        || (displayNameResolver ? displayNameResolver(username) : null)
        || username;

      // Find the Twitch channel name for emote autocomplete (7TV/BTTV/FFZ are Twitch-only).
      // streamerInfo.username is the All-Chat account owner, which may differ from the
      // actual Twitch channel name (e.g. owner "caesarlp" → Twitch channel "etro").
      const twitchPlatform = streamerInfo.platforms.find(p => p.platform === 'twitch');
      const twitchChannelName = twitchPlatform?.channel_name || undefined;

      // Use streamerInfo.username (All-Chat account owner) for WebSocket + login,
      // not the raw channel ID / handle used for the API lookup.
      this.injectAllChatUI(container, streamerInfo.username, displayName, twitchChannelName);

      // Connect to viewer WebSocket using the overlay owner's username (not the channel name)
      // e.g. watching etro's Twitch channel → streamerInfo.username = caesarlp → ws/chat/caesarlp
      await this.connectWebSocket(streamerInfo.username);
    } catch (error) {
      console.error(`[AllChat ${this.platform}] Initialization failed:`, error);
    }
  }

  /**
   * Check if streamer exists in All-Chat database
   */
  private async checkStreamerExists(username: string): Promise<StreamerInfo | null> {
    try {
      console.log(`[AllChat ${this.platform}] Sending GET_STREAMER_INFO for: ${username}`);
      const response: ExtensionResponse = await chrome.runtime.sendMessage({
        type: 'GET_STREAMER_INFO',
        username,
      } as ExtensionMessage);

      console.log(`[AllChat ${this.platform}] GET_STREAMER_INFO response:`, JSON.stringify(response));

      if (!response.success) {
        if (response.error === 'STREAMER_NOT_FOUND') {
          return null;
        }
        throw new Error(response.error);
      }

      // Treat empty platforms as "not configured" — the streamer exists but
      // has no public overlay, so the extension cannot connect.
      if (!response.data?.platforms?.length) {
        return null;
      }

      return response.data;
    } catch (error) {
      console.error(`[AllChat ${this.platform}] API check failed:`, error);
      return null;
    }
  }

  /**
   * Inject All-Chat UI into the page
   */
  /**
   * Return extra URL params to include in the AllChat iframe src.
   * Subclasses can override to inject platform-specific data (e.g. YouTube video_id).
   */
  protected getExtraIframeParams(): Record<string, string> {
    return {};
  }

  private injectAllChatUI(container: HTMLElement, streamer: string, displayName?: string, twitchChannelName?: string): void {
    const iframe = document.createElement('iframe');
    const params = new URLSearchParams({ platform: this.platform, streamer, display_name: displayName || streamer });
    if (twitchChannelName) {
      params.set('twitch_channel', twitchChannelName);
    }
    const extra = this.getExtraIframeParams();
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
    iframe.src = chrome.runtime.getURL(`ui/chat-container.html?${params}`);
    iframe.style.cssText = 'width: 100%; height: 100%; border: none; background: transparent;';
    iframe.setAttribute('data-streamer', streamer);
    iframe.setAttribute('data-platform', this.platform);

    container.appendChild(iframe);

    // Allow subclasses to hook into iframe creation (e.g. TwitchDetector sends TAB_BAR_MODE)
    this.onIframeCreated(iframe);

    console.log(`[AllChat ${this.platform}] UI injected`);
  }

  /**
   * Called immediately after the iframe element is created and appended.
   * Subclasses may override to attach load listeners or send postMessages.
   * Default implementation is a no-op.
   */
  protected onIframeCreated(_iframe: HTMLIFrameElement): void {
    // no-op by default
  }

  /**
   * Connect to viewer WebSocket for real-time messages
   */
  private async connectWebSocket(streamerUsername: string): Promise<void> {
    const response: ExtensionResponse = await chrome.runtime.sendMessage({
      type: 'CONNECT_WEBSOCKET',
      streamerUsername,
    } as ExtensionMessage);

    if (!response.success) {
      console.error(`[AllChat ${this.platform}] WebSocket connection failed:`, response.error);
    }
  }

  /**
   * Show small badge indicating streamer is not configured
   */
  private showNotConfiguredBadge(username: string): void {
    // Check if badge already exists and remove it
    const existingBadge = document.getElementById('allchat-not-configured-badge');
    if (existingBadge) {
      existingBadge.remove();
    }

    // Find a suitable location for the badge (platform-specific)
    const badge = document.createElement('div');
    badge.id = 'allchat-not-configured-badge';
    badge.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      padding: 8px 12px;
      background: #1f1f23;
      border: 1px solid #3a3a3d;
      border-radius: 4px;
      color: #adadb8;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 9999;
      opacity: 0.8;
      cursor: pointer;
    `;
    badge.textContent = `${username} is not using All-Chat`;
    badge.title = 'This streamer has not set up All-Chat yet';

    // Auto-remove after 10 seconds
    setTimeout(() => badge.remove(), 10000);

    // Remove on click
    badge.addEventListener('click', () => badge.remove());

    document.body.appendChild(badge);
  }

  /**
   * Find chat container element using multiple selector strategies
   */
  protected findChatContainer(): HTMLElement | null {
    const selectors = this.getChatContainerSelector();

    for (const selector of selectors) {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) {
        console.log(`[AllChat ${this.platform}] Found chat container with selector: ${selector}`);
        return element;
      }
    }

    console.warn(`[AllChat ${this.platform}] Could not find chat container`);
    return null;
  }
}
