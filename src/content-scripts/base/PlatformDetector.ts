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

export abstract class PlatformDetector {
  abstract platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';

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

      const displayName = displayNameResolver ? displayNameResolver(username) : username;

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

      return response.data;
    } catch (error) {
      console.error(`[AllChat ${this.platform}] API check failed:`, error);
      return null;
    }
  }

  /**
   * Inject All-Chat UI into the page
   */
  private injectAllChatUI(container: HTMLElement, streamer: string, displayName?: string, twitchChannelName?: string): void {
    const iframe = document.createElement('iframe');
    const params = new URLSearchParams({ platform: this.platform, streamer, display_name: displayName || streamer });
    if (twitchChannelName) {
      params.set('twitch_channel', twitchChannelName);
    }
    iframe.src = chrome.runtime.getURL(`ui/chat-container.html?${params}`);
    iframe.style.cssText = 'width: 100%; height: 100%; border: none; background: transparent;';
    iframe.setAttribute('data-streamer', streamer);
    iframe.setAttribute('data-platform', this.platform);

    container.appendChild(iframe);

    console.log(`[AllChat ${this.platform}] UI injected`);
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
