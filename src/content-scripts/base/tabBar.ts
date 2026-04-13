/**
 * Shared Tab Bar Module
 *
 * Provides a reusable tab bar for switching between AllChat and native
 * platform chat. Used by Twitch, YouTube, and Kick content scripts.
 */

const ACTIVE_COLOR = 'oklch(0.91 0.003 270)';
const INACTIVE_COLOR = 'oklch(0.58 0.007 270)';
const ACCENT_COLOR = '#A37BFF';
const BG_COLOR = 'oklch(0.11 0.009 270)';
const HOVER_BG = 'oklch(0.14 0.008 270)';
const BORDER_COLOR = 'oklch(from #fff l c h / 0.06)';

/**
 * Build the tab bar DOM element.
 * @param nativeTabLabel — label for the native chat tab, e.g. "Twitch Chat"
 */
export function createTabBar(nativeTabLabel: string): HTMLElement {
  const tabBar = document.createElement('div');
  tabBar.id = 'allchat-tab-bar';
  tabBar.setAttribute('role', 'tablist');
  tabBar.setAttribute('aria-label', 'Chat view switcher');
  tabBar.style.cssText = `
    height: 30px; display: flex; flex-shrink: 0;
    background: ${BG_COLOR};
    border-bottom: 1px solid ${BORDER_COLOR};
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
    background: none; border: none; border-bottom: 2px solid ${ACCENT_COLOR};
    border-right: 1px solid ${BORDER_COLOR};
    color: ${ACTIVE_COLOR}; cursor: pointer;
    padding: 0 8px; transition: color 0.15s ease;
    font-family: inherit; font-size: inherit; font-weight: inherit;
  `;

  // InfinityLogo inline SVG
  const logoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  logoSvg.setAttribute('width', '16');
  logoSvg.setAttribute('height', '10');
  logoSvg.setAttribute('viewBox', '0 0 24 14');
  logoSvg.setAttribute('fill', 'none');
  logoSvg.setAttribute('aria-hidden', 'true');
  const infPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  infPath.setAttribute('d', 'M6 10c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8');
  infPath.setAttribute('stroke', ACCENT_COLOR);
  infPath.setAttribute('stroke-width', '2.5');
  infPath.setAttribute('stroke-linecap', 'round');
  logoSvg.appendChild(infPath);
  allchatTab.appendChild(logoSvg);

  const allchatLabel = document.createElement('span');
  allchatLabel.textContent = 'AllChat';
  allchatTab.appendChild(allchatLabel);

  // Connection dot (6px, initially yellow/connecting)
  const connDot = document.createElement('span');
  connDot.id = 'allchat-tab-conn-dot';
  connDot.style.cssText = `
    width: 6px; height: 6px; border-radius: 50%;
    background: #facc15; flex-shrink: 0;
  `;
  allchatTab.appendChild(connDot);

  // Native platform tab (right)
  const nativeTab = document.createElement('button');
  nativeTab.id = 'allchat-tab-native';
  nativeTab.setAttribute('role', 'tab');
  nativeTab.setAttribute('aria-selected', 'false');
  nativeTab.setAttribute('aria-label', `${nativeTabLabel} tab — native chat view`);
  nativeTab.style.cssText = `
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
    background: none; border: none; border-bottom: 2px solid transparent;
    color: ${INACTIVE_COLOR}; cursor: pointer;
    padding: 0 8px; transition: color 0.15s ease;
    font-family: inherit; font-size: inherit; font-weight: inherit;
  `;
  nativeTab.textContent = nativeTabLabel;

  // Focus-visible outlines (WCAG 2.4.7)
  [allchatTab, nativeTab].forEach(tab => {
    tab.addEventListener('focus', () => {
      if (tab.matches(':focus-visible')) {
        tab.style.outline = `2px solid ${ACCENT_COLOR}`;
        tab.style.outlineOffset = '-2px';
      }
    });
    tab.addEventListener('blur', () => {
      tab.style.outline = 'none';
    });
  });

  // Hover states
  allchatTab.addEventListener('mouseenter', () => { allchatTab.style.background = HOVER_BG; });
  allchatTab.addEventListener('mouseleave', () => { allchatTab.style.background = 'none'; });
  nativeTab.addEventListener('mouseenter', () => { nativeTab.style.background = HOVER_BG; });
  nativeTab.addEventListener('mouseleave', () => { nativeTab.style.background = 'none'; });

  // Pop-out button (rightmost)
  const popoutBtn = document.createElement('button');
  popoutBtn.id = 'allchat-tab-popout';
  popoutBtn.setAttribute('aria-label', 'Open chat in new window');
  popoutBtn.title = 'Open in new window';
  popoutBtn.style.cssText = `
    flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
    width: 30px; background: none; border: none; border-left: 1px solid ${BORDER_COLOR};
    color: ${INACTIVE_COLOR}; cursor: pointer; transition: color 0.15s ease;
  `;
  popoutBtn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>';
  popoutBtn.addEventListener('mouseenter', () => { popoutBtn.style.color = ACTIVE_COLOR; });
  popoutBtn.addEventListener('mouseleave', () => { popoutBtn.style.color = INACTIVE_COLOR; });
  popoutBtn.addEventListener('click', () => {
    const iframe = document.querySelector('#allchat-container iframe') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'TRIGGER_POPOUT' }, '*');
    }
  });

  tabBar.appendChild(allchatTab);
  tabBar.appendChild(nativeTab);
  tabBar.appendChild(popoutBtn);

  return tabBar;
}

/**
 * Wire click handlers on the tab bar buttons.
 */
export function setupTabSwitching(onNative: () => void, onAllChat: () => void): void {
  const allchatTab = document.getElementById('allchat-tab-allchat');
  const nativeTab = document.getElementById('allchat-tab-native');
  if (!allchatTab || !nativeTab) return;

  nativeTab.addEventListener('click', onNative);
  allchatTab.addEventListener('click', onAllChat);
}

/**
 * Activate the native platform tab visually.
 */
export function switchToNativeTab(): void {
  const allchatTab = document.getElementById('allchat-tab-allchat');
  const nativeTab = document.getElementById('allchat-tab-native');

  if (allchatTab) {
    allchatTab.setAttribute('aria-selected', 'false');
    allchatTab.style.borderBottom = '2px solid transparent';
    allchatTab.style.color = INACTIVE_COLOR;
  }
  if (nativeTab) {
    nativeTab.setAttribute('aria-selected', 'true');
    nativeTab.style.borderBottom = `2px solid ${ACCENT_COLOR}`;
    nativeTab.style.color = ACTIVE_COLOR;
  }
}

/**
 * Activate the AllChat tab visually.
 */
export function switchToAllChatTab(): void {
  const allchatTab = document.getElementById('allchat-tab-allchat');
  const nativeTab = document.getElementById('allchat-tab-native');

  if (allchatTab) {
    allchatTab.setAttribute('aria-selected', 'true');
    allchatTab.style.borderBottom = `2px solid ${ACCENT_COLOR}`;
    allchatTab.style.color = ACTIVE_COLOR;
  }
  if (nativeTab) {
    nativeTab.setAttribute('aria-selected', 'false');
    nativeTab.style.borderBottom = '2px solid transparent';
    nativeTab.style.color = INACTIVE_COLOR;
  }
}

/**
 * Update the connection dot color based on WebSocket state.
 */
export function updateTabBarConnDot(state: string): void {
  const dot = document.getElementById('allchat-tab-conn-dot');
  if (!dot) return;

  switch (state) {
    case 'connected':
      dot.style.background = '#4ade80';
      break;
    case 'connecting':
    case 'reconnecting':
      dot.style.background = '#facc15';
      break;
    case 'failed':
      dot.style.background = '#f87171';
      break;
    case 'disconnected':
    default:
      dot.style.background = 'oklch(0.35 0.007 270)';
      break;
  }
}

/**
 * Remove the tab bar from the DOM.
 */
export function removeTabBar(): void {
  document.getElementById('allchat-tab-bar')?.remove();
}
