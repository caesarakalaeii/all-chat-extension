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
   * Create injection point for All-Chat UI
   */
  abstract createInjectionPoint(): HTMLElement | null;

  /**
   * Initialize All-Chat on this platform
   */
  async init(): Promise<void> {
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

      console.log(`[AllChat ${this.platform}] Streamer found! Overlay ID: ${streamerInfo.overlay_id}`);

      // Hide native chat and inject All-Chat
      this.hideNativeChat();
      const container = this.createInjectionPoint();
      if (!container) {
        console.error(`[AllChat ${this.platform}] Failed to create injection point`);
        return;
      }

      this.injectAllChatUI(container, streamerInfo.overlay_id, username);

      // Connect WebSocket
      await this.connectWebSocket(streamerInfo.overlay_id);
    } catch (error) {
      console.error(`[AllChat ${this.platform}] Initialization failed:`, error);
    }
  }

  /**
   * Check if streamer exists in All-Chat database
   */
  private async checkStreamerExists(username: string): Promise<StreamerInfo | null> {
    try {
      const response: ExtensionResponse = await chrome.runtime.sendMessage({
        type: 'GET_STREAMER_INFO',
        username,
      } as ExtensionMessage);

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
  private injectAllChatUI(container: HTMLElement, overlayId: string, streamer: string): void {
    // Create iframe for complete isolation
    const iframe = document.createElement('iframe');
    iframe.id = 'allchat-iframe';
    iframe.src = chrome.runtime.getURL('ui/chat-container.html');
    iframe.style.cssText = 'width: 100%; height: 100%; border: none; background: transparent;';
    iframe.setAttribute('data-overlay-id', overlayId);
    iframe.setAttribute('data-streamer', streamer);
    iframe.setAttribute('data-platform', this.platform);

    container.appendChild(iframe);

    // Send initialization data to iframe via postMessage
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.postMessage(
        {
          type: 'ALLCHAT_INIT',
          overlayId: overlayId,
          platform: this.platform,
          streamer: streamer,
        },
        '*'
      );
    });

    console.log(`[AllChat ${this.platform}] UI injected`);
  }

  /**
   * Connect to WebSocket for real-time messages
   */
  private async connectWebSocket(overlayId: string): Promise<void> {
    const response: ExtensionResponse = await chrome.runtime.sendMessage({
      type: 'CONNECT_WEBSOCKET',
      overlayId,
    } as ExtensionMessage);

    if (!response.success) {
      console.error(`[AllChat ${this.platform}] WebSocket connection failed:`, response.error);
    }
  }

  /**
   * Show small badge indicating streamer is not configured
   */
  private showNotConfiguredBadge(username: string): void {
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
