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

// Twitch widget selectors — verified against live twitch.tv on 2026-04-12
// Update date and selectors when Twitch changes their DOM
const WIDGET_SELECTORS = {
  // Persistent widgets (always present for logged-in users)
  channelPoints: {
    selectors: [
      '[data-test-selector="community-points-summary"]',    // Primary — 2026-04
      '.community-points-summary',                           // Fallback class
      '[data-a-target="community-points-summary"]',         // ARIA fallback
    ],
    zone: 'tab-bar' as const,
    persistent: true,
  },
  // Transient widgets (appear/disappear during stream events)
  prediction: {
    selectors: [
      '[data-test-selector="community-prediction-highlight-header"]',  // 2026-04
      '.prediction-checkout-widget',                                    // Fallback
    ],
    zone: 'top' as const,
    persistent: false,
  },
  poll: {
    selectors: [
      '[data-test-selector*="poll"]',          // 2026-04 — broad match
      '.poll-overlay',                          // Fallback
    ],
    zone: 'top' as const,
    persistent: false,
  },
  hypeTrain: {
    selectors: [
      '[data-test-selector*="hype-train"]',    // 2026-04 — broad match
      '.hype-train-container',                  // Fallback
    ],
    zone: 'top' as const,
    persistent: false,
  },
  raid: {
    selectors: [
      '[data-test-selector*="raid"]',           // 2026-04 — broad match
      '.raid-banner',                           // Fallback
    ],
    zone: 'top' as const,
    persistent: false,
  },
} as const;

type WidgetType = keyof typeof WIDGET_SELECTORS;

// Module-level widget extraction state
let widgetObserver: MutationObserver | null = null;
const cloneSyncObservers = new Map<HTMLElement, MutationObserver>(); // original -> its sync observer
const cloneMap = new Map<HTMLElement, HTMLElement>(); // original -> clone
const cloneTypeMap = new Map<HTMLElement, WidgetType>(); // original -> widget type

/**
 * Find first matching widget element within a scope using the config's selectors.
 * Returns null if not found — degrades gracefully (D-12).
 */
function findWidget(config: typeof WIDGET_SELECTORS[WidgetType], scope: Element): HTMLElement | null {
  for (const selector of config.selectors) {
    try {
      const el = scope.querySelector(selector) as HTMLElement | null;
      if (el) return el;
    } catch {
      // Invalid selector (e.g., rotted data-test-selector*= value) — skip silently
    }
  }
  return null;
}

/**
 * Map a target element to its index path from root within the clone tree.
 * Used by event forwarding to resolve the corresponding original element.
 */
function getElementPath(target: HTMLElement, root: HTMLElement): number[] {
  const path: number[] = [];
  let el: HTMLElement | null = target;
  while (el && el !== root) {
    const parent = el.parentElement;
    if (!parent) break;
    path.unshift(Array.from(parent.children).indexOf(el));
    el = parent;
  }
  return path;
}

/**
 * Resolve an element inside a root by following an index path.
 * Returns null if path is invalid (e.g., original subtree changed since last clone sync).
 */
function resolveElementByPath(root: HTMLElement, path: number[]): HTMLElement | null {
  let el: Element = root;
  for (const idx of path) {
    if (!el.children[idx]) return null;
    el = el.children[idx];
  }
  return el as HTMLElement;
}

/**
 * Wire click and input event forwarding on a clone so user interactions
 * on the clone are relayed to the corresponding element in the original (D-11).
 */
function setupEventForwarding(clone: HTMLElement, _original: HTMLElement, _widgetType: WidgetType): void {
  // Clicking a cloned widget switches to the Twitch Chat tab where the original
  // is fully interactive. Direct event forwarding (.click() / dispatchEvent) doesn't
  // work reliably with Twitch's React event delegation system.
  clone.style.cursor = 'pointer';
  clone.title = 'Click to switch to Twitch Chat for full interaction';
  clone.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (globalDetector) {
      switchToTwitchTab(globalDetector);
    }
  }, true);
}

// Track reparented persistent widgets so we can restore them on teardown
const reparentedWidgets = new Map<HTMLElement, { originalParent: HTMLElement; originalNextSibling: Node | null }>();

/**
 * Place a widget into the specified zone.
 *
 * Persistent widgets (channel points): REPARENT the original element into the zone.
 * The real Twitch element is moved — fully interactive, no event forwarding needed.
 * We save the original parent so we can restore on teardown.
 *
 * Transient widgets (predictions, polls, etc.): CLONE into the zone.
 * Clones are display-only; clicking switches to the Twitch Chat tab for interaction.
 */
function placeWidgetInZone(original: HTMLElement, zone: 'top' | 'bottom' | 'tab-bar', widgetType: WidgetType): HTMLElement | null {
  // Guard: check if this widget or its wrapper is already tracked
  const wrapper = original.parentElement?.parentElement ?? original;
  if (cloneMap.has(original) || reparentedWidgets.has(original) || reparentedWidgets.has(wrapper)) return null;
  // Also skip if element is already inside our UI
  if (original.closest('#allchat-tab-bar') || original.closest('#allchat-widget-zone-top') || original.closest('#allchat-widget-zone-bottom')) return null;

  const config = WIDGET_SELECTORS[widgetType];

  if (config.persistent) {
    // For tab-bar zone: reparent into the tab bar (between Twitch tab and popout button)
    // For other zones: reparent into the widget zone
    const targetEl = zone === 'tab-bar'
      ? document.getElementById('allchat-tab-bar')
      : document.getElementById(zone === 'top' ? 'allchat-widget-zone-top' : 'allchat-widget-zone-bottom');
    if (!targetEl) return null;

    // REPARENT: move the real element's wrapper into the target.
    // The widget selector matches the innermost element (e.g., community-points-summary),
    // but Twitch renders popover dialogs as siblings in a parent wrapper (e.g., dMndGY).
    // We reparent 2 levels up to capture both the button AND the dialog container.
    const wrapper = original.parentElement?.parentElement ?? original;
    const wrapperParent = wrapper.parentElement;
    if (!wrapperParent) return null;
    const originalNextSibling = wrapper.nextSibling;
    reparentedWidgets.set(wrapper, { originalParent: wrapperParent, originalNextSibling });

    if (zone === 'tab-bar') {
      // Insert before the popout button (last child of tab bar)
      const popoutBtn = document.getElementById('allchat-tab-popout');
      if (popoutBtn) {
        targetEl.insertBefore(wrapper, popoutBtn);
      } else {
        targetEl.appendChild(wrapper);
      }
      // Style the wrapper to fit in the tab bar
      wrapper.style.cssText = 'display: flex; align-items: center; flex: 0 0 auto; border-left: 1px solid oklch(from #fff l c h / 0.06); padding: 0 4px; height: 36px;';
    } else {
      targetEl.appendChild(wrapper);
      if (zone === 'bottom') {
        targetEl.style.borderTop = '1px solid oklch(from #fff l c h / 0.06)';
      }
    }
    wrapper.setAttribute('data-allchat-reparented', 'true');

    // Watch for Twitch React re-creating the widget in the original location.
    // When React notices the element is gone, it creates a new one. We detect
    // that and reparent the new one too.
    const watchObserver = new MutationObserver(() => {
      const chatShell = document.querySelector('.chat-shell');
      if (!chatShell) return;
      const newWidget = findWidget(config, chatShell);
      if (newWidget && newWidget !== original && !reparentedWidgets.has(newWidget) && !reparentedWidgets.has(newWidget.parentElement?.parentElement ?? newWidget)) {
        // React re-created the widget — reparent the new wrapper
        const newWrapper = newWidget.parentElement?.parentElement ?? newWidget;
        const newWrapperParent = newWrapper.parentElement;
        if (newWrapperParent) {
          reparentedWidgets.set(newWrapper, { originalParent: newWrapperParent, originalNextSibling: newWrapper.nextSibling });
          reparentedWidgets.delete(wrapper);
          if (wrapper.parentElement) wrapper.remove();
          if (zone === 'tab-bar') {
            const popoutBtn = document.getElementById('allchat-tab-popout');
            if (popoutBtn && targetEl) {
              targetEl.insertBefore(newWrapper, popoutBtn);
            } else if (targetEl) {
              targetEl.appendChild(newWrapper);
            }
            newWrapper.style.cssText = 'display: flex; align-items: center; flex: 0 0 auto; border-left: 1px solid oklch(from #fff l c h / 0.06); padding: 0 4px; height: 36px;';
          } else if (targetEl) {
            targetEl.appendChild(newWrapper);
          }
          newWrapper.setAttribute('data-allchat-reparented', 'true');
          console.log(`[AllChat Twitch] Re-reparented ${widgetType} wrapper after React re-render`);
        }
      }
    });
    // Observe the original parent for React re-creating the widget
    watchObserver.observe(wrapperParent, { childList: true, subtree: true });
    cloneSyncObservers.set(original, watchObserver);

    console.log(`[AllChat Twitch] Reparented ${widgetType} widget into ${zone} zone (interactive)`);
    return original;
  } else {
    // CLONE: transient widgets use display-only clones (always top or bottom zone)
    const zoneId = zone === 'top' ? 'allchat-widget-zone-top' : 'allchat-widget-zone-bottom';
    const zoneEl = document.getElementById(zoneId);
    if (!zoneEl) return null;

    const clone = original.cloneNode(true) as HTMLElement;
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('data-allchat-clone', 'true');
    setupEventForwarding(clone, original, widgetType);
    zoneEl.appendChild(clone);

    if (zone === 'top') {
      zoneEl.style.maxHeight = 'none';
      zoneEl.style.overflow = 'visible';
    }

    // Sync observer for transient clones
    const syncObserver = new MutationObserver(() => {
      const currentClone = cloneMap.get(original);
      if (!currentClone) return;
      const newClone = original.cloneNode(true) as HTMLElement;
      newClone.setAttribute('aria-hidden', 'true');
      newClone.setAttribute('data-allchat-clone', 'true');
      setupEventForwarding(newClone, original, widgetType);
      currentClone.replaceWith(newClone);
      cloneMap.set(original, newClone);
    });
    syncObserver.observe(original, { childList: true, subtree: true, attributes: true, characterData: true });

    cloneSyncObservers.set(original, syncObserver);
    cloneMap.set(original, clone);
    cloneTypeMap.set(original, widgetType);

    console.log(`[AllChat Twitch] Cloned ${widgetType} widget into ${zone} zone (display-only)`);
    return clone;
  }
}

/**
 * Remove a widget from its zone: restores reparented originals, removes clones,
 * disconnects observers, collapses zones if empty (D-16).
 */
function removeWidgetFromZone(original: HTMLElement): void {
  // Handle reparented persistent widgets — restore to original location
  const reparentInfo = reparentedWidgets.get(original);
  if (reparentInfo) {
    original.removeAttribute('data-allchat-reparented');
    if (reparentInfo.originalNextSibling) {
      reparentInfo.originalParent.insertBefore(original, reparentInfo.originalNextSibling);
    } else {
      reparentInfo.originalParent.appendChild(original);
    }
    reparentedWidgets.delete(original);
  }

  // Handle cloned transient widgets
  const clone = cloneMap.get(original);
  if (clone) {
    clone.remove();
    cloneMap.delete(original);
    cloneTypeMap.delete(original);
  }

  const syncObs = cloneSyncObservers.get(original);
  if (syncObs) {
    syncObs.disconnect();
    cloneSyncObservers.delete(original);
  }

  // Collapse zones if empty
  const topZone = document.getElementById('allchat-widget-zone-top');
  if (topZone && topZone.children.length === 0) {
    topZone.style.maxHeight = '0';
    topZone.style.overflow = 'hidden';
  }
  const bottomZone = document.getElementById('allchat-widget-zone-bottom');
  if (bottomZone && bottomZone.children.length === 0) {
    bottomZone.style.borderTop = 'none';
  }
}

/**
 * Build combined CSS selector string from a config's selector array.
 * Returns null if all selectors fail to produce a valid string.
 */
function buildSelectorString(selectors: readonly string[]): string | null {
  const valid = selectors.filter(s => {
    try { document.querySelector(s); return true; } catch { return false; }
  });
  return valid.length > 0 ? valid.join(',') : null;
}

/**
 * Start the widget detection system (D-14, D-15).
 * 1. Scans chatShell for persistent widgets (channel points) on init.
 * 2. Watches for transient widgets (predictions, polls, hype trains, raids)
 *    appearing/disappearing via MutationObserver.
 *
 * Graceful degradation: if no widgets found, zones stay collapsed. No errors thrown.
 */
function startWidgetDetection(chatShell: HTMLElement): void {
  // Initial scan for persistent widgets (D-15)
  // Retry a few times — Twitch renders channel points asynchronously after chat loads
  const scanPersistent = (retries: number) => {
    let foundAll = true;
    for (const [type, config] of Object.entries(WIDGET_SELECTORS)) {
      if (config.persistent && !cloneMap.size) {
        const widget = findWidget(config, chatShell);
        if (widget) {
          placeWidgetInZone(widget, config.zone, type as WidgetType);
        } else {
          foundAll = false;
        }
      }
    }
    if (!foundAll && retries > 0) {
      setTimeout(() => scanPersistent(retries - 1), 2000);
    }
  };
  scanPersistent(5); // retry up to 5 times over 10 seconds

  // D-14: MutationObserver for transient widgets
  // NOTE (T-07-06): Observer is scoped to avoid firing on every chat message DOM update.
  // Two separate observations:
  //   1. chatShell direct children (childList: true, subtree: false) — top-level widget appearance
  //   2. stream-chat area (childList: true, subtree: true) — widgets nested inside chat content area
  widgetObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check added nodes for widget matches
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        for (const [type, config] of Object.entries(WIDGET_SELECTORS)) {
          const selectorStr = buildSelectorString(config.selectors);
          if (!selectorStr) continue;
          // Check if the added node IS the widget or CONTAINS the widget
          let widget: HTMLElement | null = null;
          try {
            widget = node.matches(selectorStr)
              ? node
              : node.querySelector(selectorStr) as HTMLElement | null;
          } catch {
            continue;
          }
          if (widget && !cloneMap.has(widget)) {
            placeWidgetInZone(widget, config.zone, type as WidgetType);
          }
        }
      }

      // D-16: Check removed nodes — remove clones when originals disappear
      for (const node of mutation.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        for (const [original] of cloneMap.entries()) {
          if (node === original || node.contains(original)) {
            removeWidgetFromZone(original);
          }
        }
      }
    }
  });

  // Observe chatShell direct children for top-level widget appearance (low-cost)
  widgetObserver.observe(chatShell, { childList: true, subtree: false });

  // Also observe the chat content area for nested widget containers
  const chatContent = chatShell.querySelector('.stream-chat') || chatShell;
  if (chatContent !== chatShell) {
    widgetObserver.observe(chatContent, { childList: true, subtree: true });
  }

  console.log('[AllChat Twitch] Widget detection started');
}

/**
 * Stop widget detection: disconnect observers, remove all clones from DOM.
 */
function stopWidgetDetection(): void {
  widgetObserver?.disconnect();
  widgetObserver = null;
  for (const [, obs] of cloneSyncObservers) {
    obs.disconnect();
  }
  cloneSyncObservers.clear();
  // Remove transient clones
  for (const [, clone] of cloneMap) {
    clone.remove();
  }
  cloneMap.clear();
  cloneTypeMap.clear();
  // Restore reparented persistent widgets to their original locations
  for (const [widget, info] of reparentedWidgets) {
    widget.removeAttribute('data-allchat-reparented');
    try {
      if (info.originalNextSibling) {
        info.originalParent.insertBefore(widget, info.originalNextSibling);
      } else {
        info.originalParent.appendChild(widget);
      }
    } catch {
      // Original parent may be gone — widget stays where it is
    }
  }
  reparentedWidgets.clear();
  console.log('[AllChat Twitch] Widget detection stopped');
}

/**
 * Re-sync all clones after AllChat tab becomes visible again.
 * Removes stale clones for originals no longer in DOM.
 * Re-clones to pick up changes that occurred while zones were hidden.
 * Also scans for new persistent widgets that appeared while hidden.
 */
function resyncWidgetClones(): void {
  // Re-sync transient clones
  for (const [original, clone] of cloneMap.entries()) {
    if (!document.contains(original)) {
      removeWidgetFromZone(original);
    } else {
      const wType = cloneTypeMap.get(original) ?? 'channelPoints';
      const newClone = original.cloneNode(true) as HTMLElement;
      newClone.setAttribute('aria-hidden', 'true');
      newClone.setAttribute('data-allchat-clone', 'true');
      setupEventForwarding(newClone, original, wType);
      clone.replaceWith(newClone);
      cloneMap.set(original, newClone);
    }
  }

  // Persistent widgets: check if they're still in their zone; re-reparent if React re-created them
  const chatShell = document.querySelector('.chat-shell') as HTMLElement | null;
  if (chatShell) {
    for (const [type, config] of Object.entries(WIDGET_SELECTORS)) {
      if (config.persistent) {
        const widget = findWidget(config, chatShell);
        if (widget && !reparentedWidgets.has(widget) && !cloneMap.has(widget)) {
          placeWidgetInZone(widget, config.zone, type as WidgetType);
        }
      }
    }
  }
}

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
    position: absolute; top: 0; left: 0; right: 0; z-index: 9999;
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

  // Pop-out button (rightmost in tab bar, replaces floating iframe button)
  const popoutBtn = document.createElement('button');
  popoutBtn.id = 'allchat-tab-popout';
  popoutBtn.setAttribute('aria-label', 'Open chat in new window');
  popoutBtn.title = 'Open in new window';
  popoutBtn.style.cssText = `
    flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
    width: 36px; background: none; border: none; border-left: 1px solid oklch(from #fff l c h / 0.06);
    color: oklch(0.58 0.007 270); cursor: pointer; transition: color 0.15s ease;
  `;
  popoutBtn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>';
  popoutBtn.addEventListener('mouseenter', () => { popoutBtn.style.color = 'oklch(0.91 0.003 270)'; });
  popoutBtn.addEventListener('mouseleave', () => { popoutBtn.style.color = 'oklch(0.58 0.007 270)'; });
  popoutBtn.addEventListener('click', () => {
    // Send POPOUT_REQUEST to the iframe which handles the pop-out logic
    const iframe = document.querySelector('#allchat-container iframe') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'TRIGGER_POPOUT' }, '*');
    }
  });

  tabBar.appendChild(allchatTab);
  tabBar.appendChild(twitchTab);
  tabBar.appendChild(popoutBtn);

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
function switchToTwitchTab(_detector: TwitchDetector): void {
  const allchatTab = document.getElementById('allchat-tab-allchat') as HTMLButtonElement | null;
  const twitchTab = document.getElementById('allchat-tab-twitch') as HTMLButtonElement | null;
  const container = document.getElementById('allchat-container');

  // Instead of display:none + showNativeChat() (which triggers React re-renders
  // that can remove our injected elements), just push the container behind native
  // chat via z-index. Native chat is always in the DOM — hiding CSS makes it
  // invisible. We toggle that CSS AND keep the container in place.
  if (container) {
    container.style.visibility = 'hidden';
    container.style.pointerEvents = 'none';
  }
  // Remove the hide-native CSS so native chat shows through.
  // We remove+re-add instead of toggling .disabled (Firefox doesn't support
  // .disabled on injected <style> elements reliably).
  const hideStyle = document.getElementById('allchat-hide-native-style');
  if (hideStyle) {
    hideStyle.remove();
  }

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
    container.style.visibility = 'visible';
    container.style.pointerEvents = 'auto';
  }
  // Re-inject the hide-native CSS (was removed during Twitch tab switch).
  // We call hideNativeChat() which is idempotent (checks if style exists first).
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

  // Re-sync widget clones to catch any changes that occurred while zones were hidden
  resyncWidgetClones();

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
      /* Hide native .chat-shell children behind AllChat's opaque container */
      .chat-shell > *:not(#allchat-tab-bar):not(#allchat-container) {
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        overflow: hidden !important;
        position: absolute !important;
      }
      /* Fix Twitch channel points popover positioning after reparent.
         The dialog opens inside the reparented widget in our bottom zone —
         position: absolute with the original offset renders it off-screen.
         Override to fixed positioning anchored at the bottom-right of viewport. */
      #allchat-widget-zone-bottom [role="dialog"] {
        position: fixed !important;
        bottom: 50px !important;
        right: 10px !important;
        top: auto !important;
        left: auto !important;
        z-index: 10001 !important;
        max-height: 70vh !important;
        overflow-y: auto !important;
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
      // Make .chat-shell a positioning context so allchat-container can overlay it.
      // Cap height at parent's height — without this, hidden native chat content
      // expands .chat-shell beyond its visible area, pushing the bottom widget zone
      // below the visible clip boundary.
      slot.style.position = 'relative';
      slot.style.overflow = 'hidden';
      const parentHeight = slot.parentElement?.getBoundingClientRect().height;
      if (parentHeight) {
        slot.style.maxHeight = parentHeight + 'px';
      }

      // Create and inject tab bar as sibling to #allchat-container (D-04 through D-08)
      const tabBar = createTabBar();
      slot.appendChild(tabBar);

      // Create #allchat-container as flex column with padding-top for the tab bar
      const container = document.createElement('div');
      container.id = 'allchat-container';
      container.style.cssText = 'position: absolute; inset: 0; z-index: 9998; display: flex; flex-direction: column; padding-top: 36px; background: oklch(0.09 0.007 270);';

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
      widgetZoneBottom.style.cssText = 'flex: 0 0 auto; overflow: hidden; max-height: 50px;';
      container.appendChild(widgetZoneBottom);

      slot.appendChild(container);

      // Start widget extraction: clone persistent widgets, watch for transient ones (D-14, D-15)
      startWidgetDetection(slot);

      // Wire tab switching — the tab bar handler calls hideNativeChat/showNativeChat
      setupTabSwitching(this);

      // Guard against React reconciliation removing our injected elements.
      // Twitch's React manages .chat-shell — when it re-renders (e.g., after
      // native chat visibility toggles), it may remove nodes it doesn't own.
      // We watch .chat-shell itself and re-append our elements if they vanish.
      const guardObserver = new MutationObserver(() => {
        if (!slot.contains(tabBar)) {
          console.log('[AllChat Twitch] Tab bar removed by React — re-injecting');
          slot.appendChild(tabBar);
        }
        if (!slot.contains(container)) {
          console.log('[AllChat Twitch] Container removed by React — re-injecting');
          slot.appendChild(container);
        }
      });
      guardObserver.observe(slot, { childList: true });

      // Set up scoped MutationObserver on .chat-shell's parent (INJ-03)
      if (slot.parentElement) {
        slotObserver?.disconnect();
        slotObserver = new MutationObserver(() => {
          const slotExists = slot.parentElement?.querySelector('.chat-shell');
          const containerExists = document.getElementById('allchat-container');
          if (!slotExists && !containerExists && globalDetector) {
            console.log('[AllChat Twitch] .chat-shell removed, re-running waitForElement...');
            guardObserver.disconnect();
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
      // TAB_BAR_MODE is a non-sensitive UI toggle (hides header in favour of tab bar).
      // Use '*' targetOrigin for Firefox compatibility (moz-extension:// vs chrome-extension://).
      iframe.contentWindow?.postMessage({ type: 'TAB_BAR_MODE', enabled: true }, '*');
      console.log('[AllChat Twitch] Sent TAB_BAR_MODE to iframe');
    });
  }

  teardown(): void {
    // Stop widget detection before other cleanup
    stopWidgetDetection();
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
