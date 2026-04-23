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
 * YouTube Content Script
 *
 * Handles All-Chat injection on YouTube.com
 * URL formats: youtube.com/watch?v=..., youtube.com/live/..., youtube.com/@username
 *
 * Strategy: Full-panel toggle with tab bar.
 * A tab bar lets users switch between AllChat and native YouTube chat.
 * YouTube's chat is inside a cross-origin iframe (ytd-live-chat-frame),
 * so we toggle the entire element rather than targeting individual children.
 */

import { PlatformDetector } from './base/PlatformDetector';
import { createTabBar, setupTabSwitching, switchToNativeTab, switchToAllChatTab as switchToAllChatTabVisual, updateTabBarConnDot, removeTabBar, isLightMode, watchThemeChanges } from './base/tabBar';
import { getSyncStorage } from '../lib/storage';

// Guard observer — watches for YouTube removing our injected elements
let guardObserver: MutationObserver | null = null;

// Live observers that align the AllChat overlay with the native stack
// heights inside the iframe (header + banner + ticker at top, input at
// bottom). Tracked at module scope so showNativeChat/teardown can tear
// them down — otherwise the observers would keep clamping inline styles
// on the frame and the native tab would render tiny.
let ytStackResizeObserver: ResizeObserver | null = null;
let ytStackMutationObserver: MutationObserver | null = null;
let ytPickerMutationObserver: MutationObserver | null = null;
let ytPickerResizeObserver: ResizeObserver | null = null;
// Watches #overlay-dialog — where super-chat purchase dialog and
// membership dialogs mount outside the #pickers iron-pages.
let ytOverlayDialogObserver: MutationObserver | null = null;

/**
 * Activate the YouTube Chat tab: hide AllChat, show native YouTube chat.
 */
function handleSwitchToYouTube(detector: YouTubeDetector): void {
  const container = document.getElementById('allchat-container');
  if (container) container.style.display = 'none';
  // showNativeChat() removes both the outer frame-shrink style AND the
  // in-iframe trim style so the full native chat UI returns.
  detector.showNativeChat();
  switchToNativeTab();
  console.log('[AllChat YouTube] Switched to YouTube Chat tab');
}

/**
 * Activate the AllChat tab: show AllChat, hide native YouTube chat.
 */
function handleSwitchToAllChat(detector: YouTubeDetector): void {
  const container = document.getElementById('allchat-container');
  if (container) container.style.display = 'flex';
  detector.hideNativeChat();
  switchToAllChatTabVisual();
  console.log('[AllChat YouTube] Switched to AllChat tab');
}

class YouTubeDetector extends PlatformDetector {
  platform = 'youtube' as const;

  /**
   * Check if the current page is a live stream.
   * Returns true only for active live streams, not VODs.
   */
  isLiveStream(): boolean {
    const liveChatFrame = document.querySelector('ytd-live-chat-frame');
    if (liveChatFrame) {
      console.log('[AllChat YouTube] Live chat frame detected');
      return true;
    }

    if (window.location.pathname.includes('/live/')) {
      console.log('[AllChat YouTube] /live/ URL detected');
      return true;
    }

    const liveBadge = document.querySelector('.ytp-live-badge, .badge-style-type-live-now');
    if (liveBadge) {
      console.log('[AllChat YouTube] Live badge detected');
      return true;
    }

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
    const urlMatch = window.location.pathname.match(/@([^\/]+)/);
    if (urlMatch) return urlMatch[1];

    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      const dataScript = scripts.find(s => s.textContent?.includes('"channelId"'));
      if (dataScript && dataScript.textContent) {
        const match = dataScript.textContent.match(/"channelId":"(UC[^"]+)"/);
        if (match) return match[1];
      }
    } catch { /* ignore */ }

    const channelLink = document.querySelector('link[itemprop="url"]');
    if (channelLink) {
      const href = channelLink.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
    }

    const channelNameElement = document.querySelector('ytd-channel-name a');
    if (channelNameElement) {
      const href = channelNameElement.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
      const idMatch = href?.match(/\/channel\/(UC[^\/]+)/);
      if (idMatch) return idMatch[1];
    }

    const ownerLink = document.querySelector('a.yt-simple-endpoint.ytd-video-owner-renderer');
    if (ownerLink) {
      const href = ownerLink.getAttribute('href');
      const match = href?.match(/@([^\/]+)/);
      if (match) return match[1];
      const idMatch = href?.match(/\/channel\/(UC[^\/]+)/);
      if (idMatch) return idMatch[1];
    }

    return null;
  }

  extractDisplayName(fallback: string): string {
    const channelNameEl = document.querySelector('ytd-channel-name #text, ytd-channel-name a');
    if (channelNameEl?.textContent?.trim()) {
      return channelNameEl.textContent.trim();
    }
    return fallback;
  }

  private getUnsupportedStreamReason(): string | null {
    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      const playerScript = scripts.find(s => s.textContent?.includes('ytInitialPlayerResponse'));
      if (!playerScript?.textContent) return null;

      if (/["']isUpcoming["']\s*:\s*true/.test(playerScript.textContent)) {
        return 'scheduled';
      }
      if (/["']isUnlisted["']\s*:\s*true/.test(playerScript.textContent)) {
        return 'unlisted';
      }
    } catch {
      // Can't parse — assume OK
    }
    return null;
  }

  private showUnsupportedStreamBadge(reason: 'scheduled' | 'unlisted'): void {
    const existingBadge = document.getElementById('allchat-unsupported-badge');
    if (existingBadge) existingBadge.remove();

    const messages: Record<string, string> = {
      scheduled: 'AllChat only works on live streams, not scheduled ones. Come back when the stream is live!',
      unlisted: 'AllChat doesn\'t support unlisted streams. Only public live streams are supported.',
    };

    const badge = document.createElement('div');
    badge.id = 'allchat-unsupported-badge';
    badge.style.cssText = `
      position: fixed; bottom: 10px; right: 10px; padding: 10px 14px;
      background: #1f1f23; border: 1px solid #f59e0b; border-radius: 6px;
      color: #fbbf24; font-size: 12px; z-index: 9999; max-width: 280px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      cursor: pointer; line-height: 1.4;
    `;
    badge.textContent = messages[reason];
    badge.title = 'Click to dismiss';
    badge.addEventListener('click', () => badge.remove());
    setTimeout(() => badge.remove(), 15000);

    document.body.appendChild(badge);
  }

  async init(): Promise<void> {
    console.log(`[AllChat ${this.platform}] Initializing...`);

    if (!this.isLiveStream()) {
      console.log(`[AllChat ${this.platform}] Not a live stream, skipping`);
      return;
    }

    const unsupportedReason = this.getUnsupportedStreamReason();
    if (unsupportedReason) {
      console.log(`[AllChat ${this.platform}] Stream is ${unsupportedReason}, not supported`);
      this.showUnsupportedStreamBadge(unsupportedReason as 'scheduled' | 'unlisted');
      return;
    }

    return super.init(this.extractDisplayName.bind(this));
  }

  private extractVideoId(): string | null {
    const vParam = new URLSearchParams(window.location.search).get('v');
    if (vParam) return vParam;

    const liveMatch = window.location.pathname.match(/\/live\/([^/?]+)/);
    if (liveMatch) return liveMatch[1];

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const href = canonical.getAttribute('href');
      const match = href?.match(/\/watch\?v=([^&]+)/);
      if (match) return match[1];
    }

    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        if (s.textContent?.includes('ytInitialPlayerResponse')) {
          const match = s.textContent.match(/"videoId":"([^"]{11})"/);
          if (match) return match[1];
          break;
        }
      }
    } catch { /* ignore */ }

    return null;
  }

  protected override getExtraIframeParams(): Record<string, string> {
    const videoId = this.extractVideoId();
    return videoId ? { video_id: videoId } : {};
  }

  getChatContainerSelector(): string[] {
    return [
      'ytd-live-chat-frame',
      '#chat-container',
      '#chat',
      '[id="chat"]',
      '.yt-live-chat-app',
    ];
  }

  hideNativeChat(): void {
    // Overlay architecture:
    //   parent (position: relative, flex col)
    //     ├── #allchat-tab-bar       (normal flow at top, ~30px)
    //     ├── ytd-live-chat-frame    (position: absolute, fills column below
    //     │                           tab bar, z-index: 1 by default)
    //     │     └── iframe: native header / banner / ticker at top,
    //     │                 message list HIDDEN in the middle,
    //     │                 input / emoji / super-chat / reactions at bottom
    //     └── #allchat-container     (position: absolute, fills ONLY the
    //                                  middle band between the top native
    //                                  stack and the input, z-index: 2)
    //
    // When a picker (emoji / super-chat / reactions) opens inside the
    // iframe, we bump the frame's z-index above AllChat so the picker
    // hovers over the cross-platform feed instead of being clipped by the
    // old collapsed-frame geometry. See wirePickerOverlay.
    //
    // Switching to the native tab just hides #allchat-container and
    // removes the iframe trim — the frame is already full column height,
    // so the native chat returns at full size with zero reshaping.

    // BEFORE injecting the absolute-positioning CSS, capture the parent's
    // current intrinsic height (derived from its flex children) and pin it
    // as min-height. Once every child becomes position:absolute the parent
    // would collapse otherwise — and an absolutely positioned AllChat
    // overlay inside a zero-height parent is also zero-height.
    const chatFrame = document.querySelector('ytd-live-chat-frame') as HTMLElement | null;
    const parent = chatFrame?.parentElement as HTMLElement | null;
    if (parent) {
      const h = parent.getBoundingClientRect().height;
      if (h > 100 && !parent.style.minHeight) {
        parent.style.minHeight = `${h}px`;
      }
      if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
    }

    if (!document.getElementById('allchat-hide-native-style')) {
      const style = document.createElement('style');
      style.id = 'allchat-hide-native-style';
      style.textContent = `
        ytd-live-chat-frame {
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          z-index: 1 !important;
          flex: 0 0 auto !important;
          /* Override YT's own height var (--ytd-watch-flexy-chat-max-height)
             so the frame stretches edge-to-edge between tab-bar and column
             bottom via our inline top + bottom:0. Otherwise the rule
             "#chat.ytd-watch-flexy { height: var(...) }" clamps it. */
          height: auto !important;
          max-height: none !important;
          min-height: 0 !important;
          transition: z-index 0s !important;
        }
        ytd-live-chat-frame.allchat-picker-active {
          z-index: 3 !important;
        }
        ytd-live-chat-frame iframe {
          width: 100% !important;
          height: 100% !important;
          border: none !important;
          display: block !important;
          background: transparent !important;
        }
        #allchat-container {
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          z-index: 2 !important;
          /* display is controlled by inline style ('flex' on AllChat tab,
             'none' on YouTube tab) — no !important here so handleSwitchToYouTube
             can actually hide the overlay. */
          flex-direction: column !important;
          min-height: 0 !important;
        }
        #allchat-container iframe {
          flex: 1 1 auto !important;
          min-height: 0 !important;
        }
      `;
      document.head.appendChild(style);
    }

    this.applyIframeTrim();

    // Re-apply on iframe navigation (SPA) / reload — the iframe document
    // is recreated and our injected style tag + observers don't survive.
    const iframe = document.querySelector('ytd-live-chat-frame iframe') as HTMLIFrameElement | null;
    if (iframe && !iframe.dataset.allchatTrimWired) {
      iframe.dataset.allchatTrimWired = '1';
      iframe.addEventListener('load', () => this.applyIframeTrim());
    }

    console.log('[AllChat YouTube] Overlay active — native stack visible, messages hidden, pickers layered above AllChat');
  }

  /**
   * Inject CSS into YouTube's live-chat iframe to hide ONLY the message
   * list. Same-origin (youtube.com → youtube.com/live_chat) lets us reach
   * into the iframe's document. Safe-retry: we poll briefly because the
   * iframe document may not be ready yet.
   *
   * The iframe body is made transparent so the AllChat overlay behind it
   * shows through the empty messages area. Every other native widget
   * (header, banner, ticker, input with its emoji / super-chat / reactions
   * buttons) stays at its natural position and full size — pickers render
   * and expand naturally inside the full-height frame.
   */
  private applyIframeTrim(attempt = 0): void {
    const iframe = document.querySelector('ytd-live-chat-frame iframe') as HTMLIFrameElement | null;
    const doc = iframe?.contentDocument;
    if (!doc || !doc.head) {
      if (attempt < 10) setTimeout(() => this.applyIframeTrim(attempt + 1), 300);
      return;
    }
    if (!doc.getElementById('allchat-yt-trim')) {
      const style = doc.createElement('style');
      style.id = 'allchat-yt-trim';
      style.textContent = `
        /* Hide ONLY the scrollable message list (#chat inside #contents).
           Keep header, banner manager, ticker, and input — including their
           pickers — fully interactive at natural sizes. */
        yt-live-chat-renderer #contents > #chat,
        yt-live-chat-renderer #item-list,
        yt-live-chat-item-list-renderer {
          display: none !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          /* Transparent so the AllChat overlay shows through the empty
             middle band where the message list used to be. */
          background: transparent !important;
        }
        body { position: relative !important; }
        /* With #chat hidden, the input renderer collapses upward next to
           the ticker. Anchor it at the bottom of the iframe so it stays
           in its conventional location and pickers (emoji / super-chat /
           reactions) open upward from there — visually on top of AllChat
           thanks to the frame's z-index flip when the picker is active. */
        body > yt-live-chat-app,
        yt-live-chat-app,
        yt-live-chat-renderer {
          position: static !important;
        }
        yt-live-chat-message-input-renderer,
        yt-live-chat-restricted-participation-renderer {
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          top: auto !important;
          /* No width:100% — input renderer is box-sizing: content-box with
             24px horizontal padding, so width:100% expands to 400+48=448px
             inside a 400px iframe and clips the rightmost action button
             (reactions). left:0 + right:0 already fits the element to its
             containing block while respecting padding. */
          z-index: 2 !important;
          background: var(--yt-live-chat-background-color, #0f0f0f) !important;
        }
        /* Match the platform's dark/light surface on the parts that DO
           paint (header + ticker + banner bands) so they don't look like
           an unpainted iframe row over the video feed. */
        yt-live-chat-header-renderer,
        yt-live-chat-banner-manager,
        yt-live-chat-ticker-renderer {
          background: var(--yt-live-chat-background-color, #0f0f0f) !important;
        }
      `;
      doc.head.appendChild(style);
    }

    this.wireOverlayObservers(doc, iframe!);
  }

  /**
   * Align the AllChat overlay with the iframe's native stack boundaries
   * and flip the frame's z-index above AllChat whenever a picker (emoji,
   * super-chat / product picker, live reactions) is open inside the
   * iframe.
   *
   * Strategy:
   *   - Measure top stack (header + banner + ticker) and bottom stack
   *     (input / restricted-participation renderer) heights.
   *   - Set #allchat-container's top/bottom inline styles so it covers
   *     only the middle messages band.
   *   - Observe size/DOM changes so super-chats appearing, banners
   *     pinning, picker panels expanding etc. all stay in sync.
   *   - Add a visibility check on #pickers children and the reaction
   *     panel — when any is open, toggle `.allchat-picker-active` on the
   *     frame so its z-index rises above the AllChat overlay.
   */
  private wireOverlayObservers(doc: Document, iframe: HTMLIFrameElement): void {
    const win = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (!win) return;
    const frame = document.querySelector('ytd-live-chat-frame') as HTMLElement | null;
    const container = document.getElementById('allchat-container');
    const tabBar = document.getElementById('allchat-tab-bar');
    if (!frame || !container) return;

    // The tab bar lives in normal flex flow above the frame; offset the
    // absolute-positioned frame by the tab bar's measured height so the
    // native header isn't hidden behind it. Parent position + min-height
    // are preserved in hideNativeChat so the parent box stays non-zero.
    const tabBarH = tabBar ? tabBar.getBoundingClientRect().height : 0;
    frame.style.top = `${tabBarH}px`;

    // ---- Align AllChat with the native stack ----
    const getTopStackH = (): number => {
      const header = doc.querySelector('yt-live-chat-header-renderer') as HTMLElement | null;
      const banner = doc.querySelector('yt-live-chat-banner-manager') as HTMLElement | null;
      const ticker = doc.querySelector('yt-live-chat-ticker-renderer') as HTMLElement | null;
      return (header?.offsetHeight || 0)
           + (banner?.offsetHeight || 0)
           + (ticker?.offsetHeight || 0);
    };
    // The AllChat container's bottom offset needs to align with the input
    // row's TOP edge, measured in parent-document coordinates. Using just
    // `input.offsetHeight` is wrong when the parent (#chat-container)
    // extends further than the frame — typically YouTube leaves ~16px of
    // padding below the frame, so `bottom: 56px` (= input height) leaves
    // a 17px overlap that clips the top of the input row.
    //
    // Correct formula: container's bottom (as CSS `bottom:` value) =
    //   parent.rect.bottom - input_top_in_parent_coords
    // which gives the exact distance from the parent's bottom edge to
    // where the input begins.
    const parentEl = container.parentElement as HTMLElement | null;
    const getInputBottomOffset = (): number => {
      const input = (doc.querySelector('yt-live-chat-message-input-renderer')
        || doc.querySelector('yt-live-chat-restricted-participation-renderer')) as HTMLElement | null;
      if (!input || !parentEl) return input?.offsetHeight || 0;
      const parentRect = parentEl.getBoundingClientRect();
      const iframeRect = iframe.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      const inputTopInParent = iframeRect.top + inputRect.top;
      return Math.max(0, Math.round(parentRect.bottom - inputTopInParent));
    };

    let alignRaf = false;
    // Remember the input-area bottom offset measured when no picker is
    // active. When a user picker opens (emoji / super-chat) the input
    // renderer grows taller — if we followed that growth the AllChat
    // overlay's bottom offset would balloon and visibly push the
    // cross-platform messages upward. Instead we freeze to the idle
    // value and rely on the frame's z-index flip (.allchat-picker-active)
    // to float the picker above AllChat.
    let lastIdleBotH = 0;
    const alignOverlay = () => {
      if (alignRaf) return;
      alignRaf = true;
      win.requestAnimationFrame(() => {
        alignRaf = false;
        const topH = getTopStackH();
        const pickerActive = frame.classList.contains('allchat-picker-active');
        const measuredBotH = getInputBottomOffset();
        let botH: number;
        if (pickerActive) {
          botH = lastIdleBotH || measuredBotH;
        } else {
          lastIdleBotH = measuredBotH;
          botH = measuredBotH;
        }
        container.style.top = `${tabBarH + topH}px`;
        container.style.bottom = `${botH}px`;
      });
    };

    // ---- Picker visibility detection ----
    // Two kinds of "picker" behave very differently and need different
    // overlay treatments:
    //
    //   USER_PICKER (emoji, super-chat, product-picker): user clicked the
    //   icon to open — the panel is large and needs to cover the chat
    //   column. Fine to flip the frame's z-index above AllChat; matches
    //   native YouTube behavior where the message list is hidden while
    //   the picker is open.
    //
    //   REACTION (hover-expanded live-reactions panel): a skinny vertical
    //   column of 6 buttons (~48px wide × ~216px tall) pinned to the
    //   right side of the input. Expanded transiently on hover. Flipping
    //   the whole frame z-index for this would blank all messages; the
    //   user complained about exactly that.
    //
    // So: for USER_PICKER we add `allchat-picker-active` to the frame
    // (existing behavior). For REACTION we add `allchat-reaction-active`
    // to the container and apply a clip-path hole that exposes the right
    // ~60px column where reactions actually render — AllChat messages
    // stay visible everywhere else.
    const REACTION_EXPANDED_MIN_H = 60; // closed panel ~36px, expanded stacks 6 buttons
    const REACTION_GUTTER_PX = 60;      // width of the clip-path hole
    const isVisible = (el: Element | null): boolean => {
      if (!el || !(el as HTMLElement).isConnected) return false;
      const cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const updatePickerState = () => {
      let userPicker = false;

      // Case 1: iron-pages #pickers has a child with `iron-selected`
      // class. Polymer iron-pages marks the active page via this class
      // on the child — the `selected` attribute on the parent is often
      // a property-only reflection that doesn't appear in the DOM, so
      // we can't rely on getAttribute('selected'). Children include:
      //   - yt-emoji-picker-renderer (emoji)
      //   - yt-live-chat-product-picker-panel-view-model (super-chat tiers)
      const pickers = doc.getElementById('pickers') as HTMLElement | null;
      if (pickers) {
        const activeChild = [...pickers.children].find(c => c.classList.contains('iron-selected')) as HTMLElement | null;
        if (activeChild && isVisible(activeChild)) {
          userPicker = true;
        }
      }

      // Case 2: #overlay-dialog gets populated for super-chat purchase
      // phase 2, dialog-based modals, and membership purchase flows. It
      // starts empty (childElementCount === 0) — any mounted child means
      // a user-opened overlay is active. Don't dimension-check the
      // overlay-dialog element itself: it's position:static with 0 height
      // by default and its children are positioned absolutely inside,
      // so the container's own rect never reflects the dialog's size.
      if (!userPicker) {
        const overlayDialog = doc.getElementById('overlay-dialog');
        if (overlayDialog && overlayDialog.childElementCount > 0) {
          userPicker = true;
        }
      }

      let reactionExpanded = false;
      if (!userPicker) {
        const reactionPanel = doc.querySelector('yt-reaction-control-panel-view-model');
        if (reactionPanel && reactionPanel.getBoundingClientRect().height > REACTION_EXPANDED_MIN_H) {
          reactionExpanded = true;
        }
      }

      frame.classList.toggle('allchat-picker-active', userPicker);
      if (reactionExpanded) {
        // Clip a vertical strip on the right so the expanded reaction
        // panel (which is inside the iframe at z-index:1) shows through.
        // AllChat messages stay visible on the left ~340px.
        container.style.clipPath =
          `polygon(0 0, calc(100% - ${REACTION_GUTTER_PX}px) 0, ` +
          `calc(100% - ${REACTION_GUTTER_PX}px) 100%, 0 100%)`;
      } else {
        container.style.clipPath = '';
      }
    };

    // ---- Bind observers ----
    // Disconnect AND null the references. The bind helpers below are
    // idempotent via `if (ytXxxObserver) return`, so leaving stale truthy
    // references here would make them skip the rebind silently and we'd
    // keep a disconnected observer forever — picker/super-chat detection
    // would stop working on the second init (SPA nav, iframe reload, …).
    ytStackResizeObserver?.disconnect();
    ytStackMutationObserver?.disconnect();
    ytPickerMutationObserver?.disconnect();
    ytPickerResizeObserver?.disconnect();
    ytOverlayDialogObserver?.disconnect();
    ytStackResizeObserver = null;
    ytStackMutationObserver = null;
    ytPickerMutationObserver = null;
    ytPickerResizeObserver = null;
    ytOverlayDialogObserver = null;

    const RO = win.ResizeObserver;
    const MO = win.MutationObserver;
    const schedulePickerCheck = () => win.requestAnimationFrame(updatePickerState);

    // ResizeObserver on the native stack targets handles almost every case:
    // header height changes, banner pin/unpin, ticker growing as super-chats
    // arrive, and input renderer swaps. Bind once — the targets only go away
    // on a full panel teardown, which runs showNativeChat() anyway.
    const alignTargets = [
      'yt-live-chat-header-renderer',
      'yt-live-chat-banner-manager',
      'yt-live-chat-ticker-renderer',
      'yt-live-chat-message-input-renderer',
      'yt-live-chat-restricted-participation-renderer',
    ].map(sel => doc.querySelector(sel)).filter(Boolean) as Element[];

    if (RO) {
      ytStackResizeObserver = new RO(() => { alignOverlay(); schedulePickerCheck(); });
      alignTargets.forEach(el => ytStackResizeObserver!.observe(el));
    }

    // Scoped picker observer: watches ONLY the #pickers iron-pages, for the
    // `selected` attribute flip (picker open/close) and childList churn
    // (new picker panel added). Previously this observed the whole input
    // renderer subtree with a broad attribute filter, which pulled in every
    // keystroke and every render tick. #pickers only mutates when a picker
    // actually opens or closes — rarely.
    //
    // YouTube lazy-mounts #pickers on first picker open, so this may be a
    // no-op on initial setup. bindPickerObserver() is idempotent and called
    // again from the input-panel mutation observer whenever DOM changes
    // bring #pickers into existence.
    const bindPickerObserver = () => {
      if (ytPickerMutationObserver) return; // already bound
      const pickers = doc.getElementById('pickers') as HTMLElement | null;
      if (!MO || !pickers) return;
      ytPickerMutationObserver = new MO(schedulePickerCheck);
      // Iron-pages flips an `iron-selected` class on the child that is
      // currently active. We watch children for `class` attribute changes
      // (subtree but SHALLOW — only direct children get class-tracked via
      // the default subtree traversal; since the pickers element only
      // mutates when a picker is switched or mounted, the callback rate
      // stays ~0/sec during idle chat).
      ytPickerMutationObserver.observe(pickers, {
        attributes: true,
        subtree: true,
        childList: true,
        attributeFilter: ['class'],
      });
    };
    bindPickerObserver();

    // Same pattern for the reaction-panel ResizeObserver — may mount late.
    const bindReactionObserver = () => {
      if (ytPickerResizeObserver) return;
      const reactionPanel = doc.querySelector('yt-reaction-control-panel-view-model') as HTMLElement | null;
      if (!reactionPanel) return;
      if (RO) {
        ytPickerResizeObserver = new RO(schedulePickerCheck);
        ytPickerResizeObserver.observe(reactionPanel);
      }
      // Live reactions expand via :hover — MutationObserver misses pure-CSS
      // hover transitions. Pointer events on the single reaction panel
      // (not the whole input area) give us a cheap trigger for edge cases
      // the RO misses.
      reactionPanel.addEventListener('pointerover', schedulePickerCheck, true);
      reactionPanel.addEventListener('pointerleave', schedulePickerCheck, true);
    };
    bindReactionObserver();

    // Watch #overlay-dialog for children mounting. Super-chat purchase
    // dialogs, membership purchase modals, and other "full takeover"
    // overlays inject here (it starts empty and gets populated on
    // activation). When that happens we need to flip the frame's z-index
    // above AllChat so the dialog is actually visible — otherwise it's
    // hidden behind our messages and the user sees "nothing happens" or
    // "dialog opens blank".
    const overlayDialog = doc.getElementById('overlay-dialog');
    if (MO && overlayDialog && !ytOverlayDialogObserver) {
      ytOverlayDialogObserver = new MO(schedulePickerCheck);
      ytOverlayDialogObserver.observe(overlayDialog, { childList: true });
    }

    // Scoped renderer-swap observer: watches the #input-panel slot for
    // childList changes in its subtree. That's where YouTube swaps
    // yt-live-chat-message-input-renderer ↔ yt-live-chat-restricted-participation-renderer
    // (subscribers-only mode flip) and where #pickers is lazy-mounted
    // on first picker open. We use `childList: true, subtree: true` but
    // NO attribute observation — the hot per-keystroke/per-hover attribute
    // churn stays invisible to us. The message-list churn (40 mutations/sec
    // on a busy stream) is in a sibling subtree, so nothing from there
    // reaches this observer.
    const inputPanel = doc.getElementById('input-panel');
    if (MO && inputPanel) {
      ytStackMutationObserver = new MO(() => {
        // On renderer swap / #pickers mount / reaction-panel mount: rebind
        // the observers that depend on those elements existing. Binding is
        // idempotent so repeat fires are cheap.
        const newInput = (doc.querySelector('yt-live-chat-message-input-renderer')
          || doc.querySelector('yt-live-chat-restricted-participation-renderer')) as Element | null;
        if (newInput && ytStackResizeObserver) ytStackResizeObserver.observe(newInput);
        bindPickerObserver();
        bindReactionObserver();
        alignOverlay();
        schedulePickerCheck();
      });
      ytStackMutationObserver.observe(inputPanel, { childList: true, subtree: true });
    }

    alignOverlay();
    updatePickerState();
    // Delayed alignment passes: header/ticker often resolve their natural
    // heights a few hundred ms after first paint. Without these we'd stick
    // with a stale (possibly zero) offset.
    win.setTimeout(() => { alignOverlay(); updatePickerState(); }, 500);
    win.setTimeout(() => { alignOverlay(); updatePickerState(); }, 1500);
    win.setTimeout(() => { alignOverlay(); updatePickerState(); }, 3000);
  }

  showNativeChat(): void {
    // Tear down only what the AllChat tab needed: iframe trim (so the
    // messages render again) and the alignment observers (so they stop
    // re-writing inline styles on the frame). We intentionally LEAVE the
    // outer absolute layout in place — the iframe is already full column
    // height below the tab bar, so the native chat returns at full size
    // the moment the trim and AllChat overlay are gone.
    ytStackResizeObserver?.disconnect();
    ytStackMutationObserver?.disconnect();
    ytPickerMutationObserver?.disconnect();
    ytPickerResizeObserver?.disconnect();
    ytOverlayDialogObserver?.disconnect();
    ytStackResizeObserver = null;
    ytStackMutationObserver = null;
    ytPickerMutationObserver = null;
    ytPickerResizeObserver = null;
    ytOverlayDialogObserver = null;

    const chatFrame = document.querySelector('ytd-live-chat-frame') as HTMLElement | null;
    chatFrame?.classList.remove('allchat-picker-active');
    const allchatContainer = document.getElementById('allchat-container');
    if (allchatContainer) allchatContainer.style.clipPath = '';
    const iframe = chatFrame?.querySelector('iframe') as HTMLIFrameElement | null;
    const doc = iframe?.contentDocument;
    doc?.getElementById('allchat-yt-trim')?.remove();
    console.log('[AllChat YouTube] Native tab — overlay torn down, messages restored');
  }

  /**
   * Fully remove every outer modification (run from teardown/removeAllChatUI).
   * Called on URL change / extension disable; leaves no trace on the page.
   */
  private resetOverlayLayout(): void {
    const chatFrame = document.querySelector('ytd-live-chat-frame') as HTMLElement | null;
    const parent = chatFrame?.parentElement;
    if (parent) {
      parent.style.minHeight = '';
      parent.style.position = '';
    }
    if (chatFrame) {
      chatFrame.style.top = '';
      chatFrame.style.height = '';
      chatFrame.style.minHeight = '';
      chatFrame.style.maxHeight = '';
      chatFrame.classList.remove('allchat-picker-active');
    }
    const iframe = chatFrame?.querySelector('iframe') as HTMLIFrameElement | null;
    if (iframe) {
      iframe.style.height = '';
      delete iframe.dataset.allchatTrimWired;
    }
    document.getElementById('allchat-hide-native-style')?.remove();
    const doc = iframe?.contentDocument;
    doc?.getElementById('allchat-yt-trim')?.remove();
  }

  removeAllChatUI(): void {
    const container = document.getElementById('allchat-container');
    if (container) {
      container.remove();
      console.log('[AllChat YouTube] Removed All-Chat UI');
    }
    removeTabBar();
    this.showNativeChat();
    this.resetOverlayLayout();
  }

  async createInjectionPoint(): Promise<HTMLElement | null> {
    try {
      const nativeChat = await this.waitForElement('ytd-live-chat-frame');

      const watchFlexy = document.querySelector('ytd-watch-flexy');
      const isTheaterMode = watchFlexy?.hasAttribute('theater') ?? false;

      if (isTheaterMode) {
        // In theater mode, #chat-container collapses. Use a fixed overlay with tab bar.
        const wrapper = document.createElement('div');
        wrapper.id = 'allchat-theater-wrapper';
        wrapper.style.cssText = 'position: fixed; top: 0; right: 0; width: 340px; height: 100vh; z-index: 9999; display: flex; flex-direction: column;';

        const tabBar = createTabBar('YouTube Chat', 'youtube');
        wrapper.appendChild(tabBar);

        const container = document.createElement('div');
        container.id = 'allchat-container';
        container.style.cssText = 'flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;';
        wrapper.appendChild(container);

        document.body.appendChild(wrapper);

        // Wire tab switching — native tab disabled in theater mode
        const nativeTab = document.getElementById('allchat-tab-native');
        if (nativeTab) {
          nativeTab.style.opacity = '0.4';
          nativeTab.style.cursor = 'not-allowed';
          nativeTab.title = 'Exit theater mode to view YouTube Chat';
        }

        console.log('[AllChat YouTube] Injected in theater-mode (fixed overlay with tab bar)');
        return container;
      }

      // Normal mode: inject tab bar and container as siblings of ytd-live-chat-frame
      const parent = nativeChat.parentElement;
      if (!parent) {
        console.warn('[AllChat YouTube] ytd-live-chat-frame has no parent');
        return null;
      }

      // Make parent a flex column so tab bar + content share the space
      parent.style.cssText += '; display: flex !important; flex-direction: column !important;';

      // Tab bar first
      const tabBar = createTabBar('YouTube Chat', 'youtube');
      parent.insertBefore(tabBar, parent.firstChild);

      // AllChat container after tab bar, before native chat
      const container = document.createElement('div');
      container.id = 'allchat-container';
      container.style.cssText = 'flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;';
      parent.insertBefore(container, nativeChat);

      // Ensure ytd-live-chat-frame participates in flex layout
      nativeChat.style.cssText += '; flex: 1 1 auto; min-height: 0;';

      // Hide native chat — AllChat starts as active tab
      this.hideNativeChat();

      // Wire tab switching
      const detector = this;
      setupTabSwitching(
        () => handleSwitchToYouTube(detector),
        () => handleSwitchToAllChat(detector),
      );

      // Watch for theme changes and update iframe
      watchThemeChanges('youtube', (theme) => {
        const iframe = document.querySelector('#allchat-container iframe') as HTMLIFrameElement | null;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'TAB_BAR_MODE', enabled: true, hideInput: true, theme }, '*');
        }
      });

      // Guard against YouTube removing our elements
      guardObserver?.disconnect();
      guardObserver = new MutationObserver(() => {
        if (!parent.contains(container) && document.contains(parent)) {
          console.log('[AllChat YouTube] Container removed — re-injecting');
          parent.insertBefore(container, nativeChat);
        }
        if (!parent.contains(tabBar) && document.contains(parent)) {
          console.log('[AllChat YouTube] Tab bar removed — re-injecting');
          parent.insertBefore(tabBar, parent.firstChild);
        }
      });
      guardObserver.observe(parent, { childList: true });

      console.log('[AllChat YouTube] Injected with tab bar (flex column)');
      return container;
    } catch {
      console.warn('[AllChat YouTube] ytd-live-chat-frame not found — native chat remains visible');
      return null;
    }
  }

  protected onIframeCreated(iframe: HTMLIFrameElement): void {
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.postMessage({ type: 'TAB_BAR_MODE', enabled: true, hideInput: true, theme: isLightMode('youtube') ? 'light' : 'dark' }, '*');
      console.log('[AllChat YouTube] Sent TAB_BAR_MODE to iframe');
    });
  }

  teardown(): void {
    removeTabBar();
    // Clean up theater wrapper if present
    document.getElementById('allchat-theater-wrapper')?.remove();
    guardObserver?.disconnect();
    guardObserver = null;
    this.showNativeChat();
    this.resetOverlayLayout();
    super.teardown();
  }
}

/**
 * Inject "Switch to AllChat" button into native platform pop-out chat.
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
    window.location.href = chrome.runtime.getURL(`ui/chat-container.html?${params}`);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
  } else {
    document.body.appendChild(btn);
  }
}

// ============================================================
// InnerTube API helpers — used for per-message moderation
// (Report, Block, Delete, Timeout, etc.) via YouTube's own API
// using the viewer's existing YouTube session cookies.
// No AllChat login required.
// ============================================================

/** Cached InnerTube config extracted from the YouTube page */
let innerTubeCache: { apiKey: string; context: Record<string, unknown> } | null = null;

/**
 * Extract INNERTUBE_API_KEY and INNERTUBE_CONTEXT from YouTube's page-level ytcfg.
 * Content scripts run in an isolated world so we inject a tiny <script> into the
 * MAIN world, read ytcfg, and pass the result back via CustomEvent.
 */
function getInnerTubeContext(): { apiKey: string; context: Record<string, unknown> } {
  if (innerTubeCache) return innerTubeCache;

  // Parse ytcfg data directly from YouTube's <script> tags.
  // YouTube embeds ytcfg.set({...}) calls containing INNERTUBE_API_KEY and
  // INNERTUBE_CONTEXT. This avoids inline script injection which is blocked
  // by YouTube's Content Security Policy.
  let apiKey = '';
  let context: Record<string, unknown> | null = null;

  const scripts = document.querySelectorAll('script');
  for (const s of scripts) {
    const text = s.textContent;
    if (!text || !text.includes('INNERTUBE_API_KEY')) continue;

    // Extract API key: "INNERTUBE_API_KEY":"AIza..."
    const keyMatch = text.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    if (keyMatch) apiKey = keyMatch[1];

    // Extract context: "INNERTUBE_CONTEXT":{...}
    // Find the start position and use bracket matching for the JSON object
    const ctxMarker = '"INNERTUBE_CONTEXT"';
    const ctxIdx = text.indexOf(ctxMarker);
    if (ctxIdx !== -1) {
      const braceStart = text.indexOf('{', ctxIdx + ctxMarker.length);
      if (braceStart !== -1) {
        let depth = 0;
        let end = braceStart;
        for (let i = braceStart; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') depth--;
          if (depth === 0) { end = i; break; }
        }
        try {
          context = JSON.parse(text.slice(braceStart, end + 1));
        } catch { /* ignore parse error */ }
      }
    }

    if (apiKey && context) break;
  }

  if (!apiKey || !context) {
    throw new Error('Failed to extract InnerTube context from page scripts');
  }

  innerTubeCache = { apiKey, context };
  return innerTubeCache;
}

/**
 * Compute SAPISIDHASH for authenticated InnerTube requests.
 * Reads SAPISID from the viewer's YouTube cookies (no extra permissions needed).
 */
async function getSapisidHash(origin: string): Promise<string> {
  const cookies = document.cookie.split('; ');
  let sapisid = '';
  for (const c of cookies) {
    if (c.startsWith('SAPISID=') || c.startsWith('__Secure-3PAPISID=')) {
      sapisid = c.split('=')[1];
      if (c.startsWith('SAPISID=')) break; // prefer SAPISID
    }
  }
  if (!sapisid) throw new Error('YouTube SAPISID cookie not found — viewer may not be logged in');

  const timestamp = Math.floor(Date.now() / 1000);
  const input = `${timestamp} ${sapisid} ${origin}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-1', encoder.encode(input));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `SAPISIDHASH ${timestamp}_${hashHex}`;
}

/**
 * Generic InnerTube API request helper.
 * Uses the viewer's YouTube session (cookies + SAPISIDHASH) for authentication.
 */
async function callInnerTubeApi(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { apiKey, context } = await getInnerTubeContext();
  const authHash = await getSapisidHash('https://www.youtube.com');

  const response = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Authorization': authHash,
      'Content-Type': 'application/json',
      'X-Origin': 'https://www.youtube.com',
      'X-Goog-AuthUser': '0',
    },
    credentials: 'include',
    body: JSON.stringify({ context, ...body }),
  });

  if (!response.ok) {
    throw new Error(`InnerTube ${endpoint} failed: HTTP ${response.status}`);
  }
  return response.json();
}

/** A parsed context menu action item */
interface ContextMenuAction {
  label: string;
  iconType: string;
  /** The full serviceEndpoint object — passed back to execute the action */
  serviceEndpoint: Record<string, unknown>;
}

/**
 * Fetch available context menu actions for a specific chat message.
 * Returns the list of actions YouTube offers for this viewer (varies by role).
 */
async function fetchContextMenuActions(contextParams: string): Promise<ContextMenuAction[]> {
  const data = await callInnerTubeApi('live_chat/get_item_context_menu', { params: contextParams });
  const actions: ContextMenuAction[] = [];

  // Navigate: liveChatItemContextMenuSupportedRenderers.menuRenderer.items[]
  const renderers = (data as Record<string, unknown>).liveChatItemContextMenuSupportedRenderers as Record<string, unknown> | undefined;
  const menuRenderer = renderers?.menuRenderer as Record<string, unknown> | undefined;
  const items = menuRenderer?.items as Array<Record<string, unknown>> | undefined;

  if (!items) return actions;

  for (const item of items) {
    // menuServiceItemRenderer — API-backed actions (Report, Block, Delete, Timeout, etc.)
    const serviceItem = item.menuServiceItemRenderer as Record<string, unknown> | undefined;
    if (serviceItem) {
      const textObj = serviceItem.text as Record<string, unknown> | undefined;
      const runs = textObj?.runs as Array<{ text: string }> | undefined;
      const label = runs?.map(r => r.text).join('') || '';
      const iconObj = serviceItem.icon as Record<string, unknown> | undefined;
      const iconType = (iconObj?.iconType as string) || '';
      const serviceEndpoint = serviceItem.serviceEndpoint as Record<string, unknown>;
      if (label && serviceEndpoint) {
        actions.push({ label, iconType, serviceEndpoint });
      }
    }

    // menuNavigationItemRenderer — URL-based actions (less common in live chat)
    const navItem = item.menuNavigationItemRenderer as Record<string, unknown> | undefined;
    if (navItem) {
      const textObj = navItem.text as Record<string, unknown> | undefined;
      const runs = textObj?.runs as Array<{ text: string }> | undefined;
      const label = runs?.map(r => r.text).join('') || '';
      const iconObj = navItem.icon as Record<string, unknown> | undefined;
      const iconType = (iconObj?.iconType as string) || '';
      const navEndpoint = navItem.navigationEndpoint as Record<string, unknown>;
      if (label && navEndpoint) {
        actions.push({ label, iconType, serviceEndpoint: { __navigation: true, ...navEndpoint } });
      }
    }
  }

  return actions;
}

/**
 * Execute a context menu action (e.g., moderate, flag, block).
 * Routes to the correct InnerTube endpoint based on the serviceEndpoint type.
 */
async function executeMenuAction(action: ContextMenuAction): Promise<void> {
  const ep = action.serviceEndpoint;

  // Navigation actions — open URL in new tab
  if (ep.__navigation) {
    const urlEndpoint = ep.urlEndpoint as Record<string, unknown> | undefined;
    if (urlEndpoint?.url) {
      window.open(urlEndpoint.url as string, '_blank');
      return;
    }
  }

  // Moderation actions (delete, timeout, ban/hide)
  if (ep.moderateLiveChatEndpoint) {
    const modEp = ep.moderateLiveChatEndpoint as Record<string, unknown>;
    await callInnerTubeApi('live_chat/moderate', { params: modEp.params });
    return;
  }

  // Flag/report actions
  if (ep.flagEndpoint) {
    const flagEp = ep.flagEndpoint as Record<string, unknown>;
    await callInnerTubeApi('flag/flag', { ...flagEp });
    return;
  }

  // Get form then flag (multi-step report)
  if (ep.getReportFormEndpoint) {
    const formEp = ep.getReportFormEndpoint as Record<string, unknown>;
    await callInnerTubeApi('flag/get_form', { ...formEp });
    return;
  }

  // Generic: try to call the endpoint using liveChatItemContextMenuEndpoint params
  if (ep.liveChatItemContextMenuEndpoint) {
    const ctxEp = ep.liveChatItemContextMenuEndpoint as Record<string, unknown>;
    await callInnerTubeApi('live_chat/get_item_context_menu', { params: ctxEp.params });
    return;
  }

  // Fallback: performCommentActionEndpoint (used for some block actions)
  if (ep.performCommentActionEndpoint) {
    const actionEp = ep.performCommentActionEndpoint as Record<string, unknown>;
    await callInnerTubeApi('comment/perform_comment_action', { actions: actionEp.action ? [actionEp.action] : [] });
    return;
  }

  console.warn('[AllChat YouTube] Unknown serviceEndpoint type:', Object.keys(ep));
}

// ============================================================
// InnerTube Chat Sending — send messages via YouTube's own API
// using the viewer's existing YouTube session cookies.
// ============================================================

/** Cached send-message params (pre-built by YouTube, encodes the liveChatId). */
let cachedSendParams: string | null = null;
/** Video ID the cached params belong to — invalidates cache on navigation. */
let cachedSendParamsVideoId: string | null = null;

/**
 * Fetch the pre-built sendLiveChatMessageEndpoint.params from YouTube's
 * /live_chat page HTML. YouTube generates this server-side — it's a base64
 * protobuf encoding the liveChatId with all the fields YouTube's frontend
 * uses, so we don't have to build it ourselves.
 */
async function getSendMessageParams(): Promise<string> {
  const videoId = new URLSearchParams(window.location.search).get('v')
    || window.location.pathname.match(/\/live\/([^/?]+)/)?.[1]
    || null;

  if (!videoId) {
    throw new Error('No video ID in URL — is this a live stream?');
  }

  if (cachedSendParams && cachedSendParamsVideoId === videoId) {
    return cachedSendParams;
  }

  const resp = await fetch(
    `https://www.youtube.com/live_chat?v=${videoId}&is_popout=1`,
    { credentials: 'include' },
  );
  if (!resp.ok) {
    throw new Error(`Failed to load live chat page: HTTP ${resp.status}`);
  }
  const html = await resp.text();

  const match = html.match(/"sendLiveChatMessageEndpoint"\s*:\s*\{\s*"params"\s*:\s*"([^"]+)"/);
  if (!match) {
    // Common cause: stream doesn't have chat enabled, or user not signed in to YouTube
    if (!html.includes('liveChatRenderer')) {
      throw new Error('Live chat is not available for this stream');
    }
    throw new Error('Could not find send-message params — are you signed in to YouTube?');
  }

  // YouTube URL-encodes the params in the HTML (%3D for trailing =). Decode it.
  cachedSendParams = decodeURIComponent(match[1]);
  cachedSendParamsVideoId = videoId;
  return cachedSendParams;
}

/**
 * Send a chat message via YouTube's InnerTube API.
 * Uses the viewer's YouTube session (cookies + SAPISIDHASH).
 */
async function sendYouTubeChatMessage(message: string): Promise<void> {
  const params = await getSendMessageParams();

  const clientMessageId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await callInnerTubeApi('live_chat/send_message', {
    params,
    clientMessageId,
    richMessage: {
      textSegments: [{ text: message }],
    },
  });
}

// ============================================================
// Context Menu Overlay UI
// ============================================================

/** YouTube's native icon types → inline SVG paths */
const YT_ICON_PATHS: Record<string, string> = {
  FLAG: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
  BLOCK: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 014 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0120 12c0 4.42-3.58 8-8 8z',
  DELETE: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  HOURGLASS_TOP: 'M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6z',
  REMOVE_CIRCLE: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z',
  NOT_INTERESTED: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31A7.902 7.902 0 0112 20zm6.31-3.1L7.1 5.69A7.902 7.902 0 0112 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z',
};

function getIconSvg(iconType: string): string {
  const path = YT_ICON_PATHS[iconType];
  if (!path) return '';
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="flex-shrink:0"><path d="${path}"/></svg>`;
}

/**
 * Render the YouTube-native context menu as a floating overlay on document.body.
 * This escapes the AllChat iframe's overflow:hidden constraint.
 */
function showYouTubeContextMenu(
  actions: ContextMenuAction[],
  pageX: number,
  pageY: number,
  iframeSource: Window | null,
  extensionOrigin: string,
): void {
  // Remove existing menu
  document.getElementById('allchat-yt-context-menu')?.remove();

  if (actions.length === 0) return;

  const light = isLightMode('youtube');
  const bg = light ? '#fff' : '#282828';
  const textColor = light ? '#0f0f0f' : '#f1f1f1';
  const hoverBg = light ? '#f2f2f2' : '#3e3e3e';
  const borderColor = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';

  // Transparent backdrop for click-to-dismiss
  const backdrop = document.createElement('div');
  backdrop.id = 'allchat-yt-context-menu';
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:99998;';

  // Menu dropdown
  const menu = document.createElement('div');
  menu.style.cssText = `
    position:fixed; z-index:99999; min-width:160px;
    background:${bg}; color:${textColor};
    border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.3);
    border:1px solid ${borderColor};
    padding:4px 0; font-family:Roboto,Arial,sans-serif; font-size:14px;
    overflow:hidden;
  `;

  // Position: prefer below-left of anchor, flip if needed
  const menuHeight = actions.length * 40 + 8;
  const top = (pageY + menuHeight > window.innerHeight) ? Math.max(4, pageY - menuHeight) : pageY;
  const left = (pageX + 160 > window.innerWidth) ? Math.max(4, pageX - 160) : pageX;
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  // Render action items
  for (const action of actions) {
    const item = document.createElement('div');
    item.style.cssText = `
      display:flex; align-items:center; gap:12px; padding:8px 16px;
      cursor:pointer; transition:background 0.1s;
    `;
    item.innerHTML = `${getIconSvg(action.iconType)}<span>${action.label}</span>`;

    item.addEventListener('mouseenter', () => { item.style.background = hoverBg; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
    item.addEventListener('click', async () => {
      backdrop.remove();
      try {
        await executeMenuAction(action);
        if (iframeSource) {
          iframeSource.postMessage({
            type: 'YOUTUBE_ACTION_RESULT',
            action: action.label,
            success: true,
          }, extensionOrigin);
        }
      } catch (err: unknown) {
        console.error('[AllChat YouTube] Action failed:', err);
        if (iframeSource) {
          iframeSource.postMessage({
            type: 'YOUTUBE_ACTION_RESULT',
            action: action.label,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          }, extensionOrigin);
        }
      }
    });

    menu.appendChild(item);
  }

  backdrop.appendChild(menu);
  document.body.appendChild(backdrop);

  // Dismiss on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  // Dismiss on Escape
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

// Store detector instance globally
let globalDetector: YouTubeDetector | null = null;

// Guard against duplicate message relay registration
let messageRelaySetup = false;

function handleExtensionStateChange(enabled: boolean) {
  console.log(`[AllChat YouTube] Extension state changed: ${enabled ? 'enabled' : 'disabled'}`);

  if (!enabled) {
    if (globalDetector) {
      globalDetector.removeAllChatUI();
      globalDetector.showNativeChat();
      globalDetector = null;
    }
  } else {
    if (!globalDetector) {
      globalDetector = new YouTubeDetector();
      setupGlobalMessageRelay();
      globalDetector.init();
    }
  }
}

async function initialize() {
  console.log('[AllChat YouTube] Content script loaded');

  const settings = await getSyncStorage();
  if (!settings.platformEnabled.youtube) {
    console.log('[AllChat YouTube] Extension disabled for YouTube, not injecting');
    setupGlobalMessageRelay();
    return;
  }

  const isNativePopout = window.location.pathname === '/live_chat' || window.location.pathname === '/live_chat_replay';
  if (isNativePopout) {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v') || '';
    console.log(`[AllChat YouTube] Native pop-out detected for video: ${videoId}`);
    if (videoId) {
      injectNativePopoutSwitchButton('youtube', videoId, videoId);
    }
    return;
  }

  globalDetector = new YouTubeDetector();

  chrome.runtime.sendMessage({ type: 'SET_CURRENT_PLATFORM', platform: 'youtube' }).catch((err: unknown) => {
    console.warn('[AllChat YouTube] Failed to write current_platform to session:', err);
  });

  setupGlobalMessageRelay();

  await globalDetector.waitForElement('ytd-channel-name a').catch(() => null);
  globalDetector?.init();

  setupUrlWatcher();
}

function setupGlobalMessageRelay() {
  if (messageRelaySetup) return;
  messageRelaySetup = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[AllChat YouTube] Received from service worker:', message.type);

    if (message.type === 'EXTENSION_STATE_CHANGED') {
      handleExtensionStateChange(message.enabled);
      return false;
    }

    if (message.type === 'CONNECTION_STATE' || message.type === 'WS_MESSAGE') {
      const iframes = document.querySelectorAll('iframe[data-platform="youtube"][data-streamer]');

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

    if (event.data.type === 'REQUEST_LOGIN' && event.source) {
      console.log('[AllChat YouTube] iframe requested login, opening popup from page context');
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

    if (event.data.type === 'OPEN_VIEWER_CARD' && event.data.userId) {
      window.open(`https://www.youtube.com/channel/${event.data.userId}`, '_blank');
    }

    if (event.origin !== extensionOrigin) return;

    if (event.data.type === 'POPOUT_REQUEST' && globalDetector) {
      globalDetector.handlePopoutRequest(event.data);
    }

    if (event.data.type === 'SWITCH_TO_NATIVE' && globalDetector) {
      handleSwitchToYouTube(globalDetector);
    }

    if (event.data.type === 'SWITCH_TO_ALLCHAT' && globalDetector) {
      handleSwitchToAllChat(globalDetector);
    }

    if (event.data.type === 'CLOSE_POPOUT' && globalDetector) {
      globalDetector.closePopout();
      const iframes = document.querySelectorAll('iframe[data-platform="youtube"]');
      iframes.forEach((iframe) => {
        const el = iframe as HTMLIFrameElement;
        if (el.contentWindow) {
          el.contentWindow.postMessage({ type: 'POPOUT_CLOSED' }, extensionOrigin);
        }
      });
    }

    // Handle native chat sending via InnerTube API
    if (event.data.type === 'SEND_NATIVE_CHAT' && event.data.message && event.source) {
      const source = event.source as Window;
      (async () => {
        try {
          await sendYouTubeChatMessage(event.data.message);
          source.postMessage({ type: 'SEND_NATIVE_CHAT_RESULT', success: true }, extensionOrigin);
        } catch (err: unknown) {
          console.error('[AllChat YouTube] Native send failed:', err);
          source.postMessage({
            type: 'SEND_NATIVE_CHAT_RESULT',
            success: false,
            error: err instanceof Error ? err.message : 'Failed to send message',
          }, extensionOrigin);
        }
      })();
    }

    // Handle YouTube context menu request from AllChat iframe
    if (event.data.type === 'OPEN_YOUTUBE_CONTEXT_MENU' && event.data.contextParams) {
      const { contextParams, anchorRect } = event.data;
      const iframe = document.querySelector('#allchat-container iframe') as HTMLIFrameElement | null;
      const iframeRect = iframe?.getBoundingClientRect();

      // Translate iframe-local coordinates to page-global
      const pageX = (anchorRect?.right ?? 0) + (iframeRect?.left ?? 0);
      const pageY = (anchorRect?.top ?? 0) + (iframeRect?.top ?? 0);

      // Fetch available actions from YouTube and show menu
      fetchContextMenuActions(contextParams)
        .then((actions) => {
          showYouTubeContextMenu(actions, pageX, pageY, event.source as Window | null, extensionOrigin);
        })
        .catch((err) => {
          console.error('[AllChat YouTube] Failed to fetch context menu:', err);
          if (event.source) {
            (event.source as Window).postMessage({
              type: 'YOUTUBE_ACTION_RESULT',
              action: 'context_menu',
              success: false,
              error: err instanceof Error ? err.message : 'Failed to load menu',
            }, extensionOrigin);
          }
        });
    }
  });

  console.log('[AllChat YouTube] Global message relay set up');
}

function setupUrlWatcher(): void {
  let activeUrl = location.href;

  const handleNavigation = () => {
    const url = location.href;
    if (url === activeUrl) return;
    activeUrl = url;

    console.log('[AllChat YouTube] Navigation detected, tearing down...');
    // Clear cached InnerTube data for the previous stream
    innerTubeCache = null;
    cachedSendParams = null;
    cachedSendParamsVideoId = null;
    globalDetector?.teardown();

    if (globalDetector?.isLiveStream()) {
      globalDetector.init();
    }
  };

  window.addEventListener('yt-navigate-finish', handleNavigation);
  window.addEventListener('popstate', handleNavigation);
}

function setupTheaterModeWatcher(): void {
  const watchFlexy = document.querySelector('ytd-watch-flexy');
  if (!watchFlexy) return;

  let reinitTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (!globalDetector) return;
    if (reinitTimer) clearTimeout(reinitTimer);
    reinitTimer = setTimeout(() => {
      console.log('[AllChat YouTube] Theater/fullscreen mode changed, reinitialising...');
      globalDetector?.removeAllChatUI();
      globalDetector?.showNativeChat();
      globalDetector?.init();
    }, 300);
  });

  observer.observe(watchFlexy, {
    attributes: true,
    attributeFilter: ['theater', 'fullscreen'],
  });
}

initialize().then(() => {
  setupTheaterModeWatcher();
});
