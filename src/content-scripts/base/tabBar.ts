/**
 * Shared Tab Bar Module
 *
 * Provides a reusable tab bar for switching between AllChat and native
 * platform chat. Used by Twitch, YouTube, and Kick content scripts.
 * Colors match each platform's native theme (dark AND light) for seamless integration.
 * Both tabs use the platform accent color so the bar feels fully native.
 */

type Platform = 'twitch' | 'youtube' | 'kick';

interface ThemePalette {
  bg: string;
  hoverBg: string;
  border: string;
  accent: string;     // Platform brand color — used for active tab underline + logo
  active: string;
  inactive: string;
}

// Platform-native color palettes (sampled from live sites, dark + light variants)
const THEMES: Record<Platform, { dark: ThemePalette; light: ThemePalette }> = {
  twitch: {
    dark: {
      bg: '#18181b',
      hoverBg: '#26262c',
      border: 'rgba(255,255,255,0.08)',
      accent: '#9146FF',
      active: '#efeff1',
      inactive: '#adadb8',
    },
    light: {
      bg: '#efeff1',
      hoverBg: '#dedee3',
      border: 'rgba(0,0,0,0.1)',
      accent: '#9146FF',
      active: '#0e0e10',
      inactive: '#53535f',
    },
  },
  youtube: {
    dark: {
      bg: '#0f0f0f',
      hoverBg: '#272727',
      border: 'rgba(255,255,255,0.1)',
      accent: '#FF4444',
      active: '#f1f1f1',
      inactive: '#aaa',
    },
    light: {
      bg: '#f9f9f9',
      hoverBg: '#e5e5e5',
      border: 'rgba(0,0,0,0.1)',
      accent: '#FF0000',
      active: '#0f0f0f',
      inactive: '#606060',
    },
  },
  kick: {
    dark: {
      bg: '#141517',
      hoverBg: '#1e2024',
      border: 'rgba(255,255,255,0.06)',
      accent: '#53FC18',
      active: '#e8e8e8',
      inactive: '#8b8b8b',
    },
    light: {
      bg: '#f0f0f0',
      hoverBg: '#e0e0e0',
      border: 'rgba(0,0,0,0.1)',
      accent: '#2d9a13',
      active: '#1a1a1a',
      inactive: '#666',
    },
  },
};

/**
 * Detect whether the host platform is currently in light mode.
 * Each platform has different DOM signals for its theme.
 */
export function isLightMode(platform: Platform): boolean {
  switch (platform) {
    case 'twitch':
      return !!document.querySelector('[data-a-target="chat-theme-light"]')
        || document.body.classList.contains('tw-root--theme--light');
    case 'youtube':
      return !document.documentElement.hasAttribute('dark');
    case 'kick':
      return document.documentElement.getAttribute('data-theme') === 'light'
        || document.body.getAttribute('data-theme') === 'light';
    default:
      return false;
  }
}

// Module-level reference so switchToNativeTab/switchToAllChatTab know the active theme
let activeTheme: ThemePalette = THEMES.twitch.dark;

/**
 * Build the tab bar DOM element.
 * @param nativeTabLabel — label for the native chat tab, e.g. "Twitch Chat"
 * @param platform — which platform, controls the color theme
 */
export function createTabBar(nativeTabLabel: string, platform: Platform = 'twitch'): HTMLElement {
  const light = isLightMode(platform);
  const theme = light ? THEMES[platform].light : THEMES[platform].dark;
  activeTheme = theme;

  const tabBar = document.createElement('div');
  tabBar.id = 'allchat-tab-bar';
  tabBar.setAttribute('role', 'tablist');
  tabBar.setAttribute('aria-label', 'Chat view switcher');
  tabBar.style.cssText = `
    height: 30px; display: flex; flex-shrink: 0;
    background: ${theme.bg};
    border-bottom: 1px solid ${theme.border};
    font-family: Inter, system-ui, sans-serif;
    font-size: 13px; font-weight: 600; line-height: 1;
  `;

  // AllChat tab (left) — accent matches platform color
  const allchatTab = document.createElement('button');
  allchatTab.id = 'allchat-tab-allchat';
  allchatTab.setAttribute('role', 'tab');
  allchatTab.setAttribute('aria-selected', 'true');
  allchatTab.setAttribute('aria-label', 'AllChat tab — cross-platform chat view');
  allchatTab.style.cssText = `
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    background: none; border: none; border-bottom: 2px solid ${theme.accent};
    border-right: 1px solid ${theme.border};
    color: ${theme.active}; cursor: pointer;
    padding: 0 8px; transition: color 0.15s ease, background 0.15s ease;
    font-family: inherit; font-size: inherit; font-weight: inherit;
  `;

  // InfinityLogo inline SVG — stroke matches platform accent
  const logoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  logoSvg.setAttribute('width', '16');
  logoSvg.setAttribute('height', '10');
  logoSvg.setAttribute('viewBox', '0 0 24 14');
  logoSvg.setAttribute('fill', 'none');
  logoSvg.setAttribute('aria-hidden', 'true');
  const infPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  infPath.setAttribute('d', 'M6 10c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8');
  infPath.setAttribute('stroke', theme.accent);
  infPath.setAttribute('stroke-width', '2.5');
  infPath.setAttribute('stroke-linecap', 'round');
  logoSvg.appendChild(infPath);
  allchatTab.appendChild(logoSvg);

  const allchatLabel = document.createElement('span');
  allchatLabel.textContent = 'AllChat';
  allchatTab.appendChild(allchatLabel);

  // Connection dot
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
    color: ${theme.inactive}; cursor: pointer;
    padding: 0 8px; transition: color 0.15s ease, background 0.15s ease;
    font-family: inherit; font-size: inherit; font-weight: inherit;
  `;
  nativeTab.textContent = nativeTabLabel;

  // Focus-visible outlines (WCAG 2.4.7)
  [allchatTab, nativeTab].forEach(tab => {
    tab.addEventListener('focus', () => {
      if (tab.matches(':focus-visible')) {
        tab.style.outline = `2px solid ${theme.accent}`;
        tab.style.outlineOffset = '-2px';
      }
    });
    tab.addEventListener('blur', () => {
      tab.style.outline = 'none';
    });
  });

  // Hover states
  allchatTab.addEventListener('mouseenter', () => { allchatTab.style.background = theme.hoverBg; });
  allchatTab.addEventListener('mouseleave', () => { allchatTab.style.background = 'none'; });
  nativeTab.addEventListener('mouseenter', () => { nativeTab.style.background = theme.hoverBg; });
  nativeTab.addEventListener('mouseleave', () => { nativeTab.style.background = 'none'; });

  // Pop-out button (rightmost)
  const popoutBtn = document.createElement('button');
  popoutBtn.id = 'allchat-tab-popout';
  popoutBtn.setAttribute('aria-label', 'Open chat in new window');
  popoutBtn.title = 'Open in new window';
  popoutBtn.style.cssText = `
    flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
    width: 30px; background: none; border: none; border-left: 1px solid ${theme.border};
    color: ${theme.inactive}; cursor: pointer; transition: color 0.15s ease;
  `;
  popoutBtn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>';
  popoutBtn.addEventListener('mouseenter', () => { popoutBtn.style.color = theme.active; });
  popoutBtn.addEventListener('mouseleave', () => { popoutBtn.style.color = theme.inactive; });
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
    allchatTab.style.color = activeTheme.inactive;
  }
  if (nativeTab) {
    nativeTab.setAttribute('aria-selected', 'true');
    nativeTab.style.borderBottom = `2px solid ${activeTheme.accent}`;
    nativeTab.style.color = activeTheme.active;
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
    allchatTab.style.borderBottom = `2px solid ${activeTheme.accent}`;
    allchatTab.style.color = activeTheme.active;
  }
  if (nativeTab) {
    nativeTab.setAttribute('aria-selected', 'false');
    nativeTab.style.borderBottom = '2px solid transparent';
    nativeTab.style.color = activeTheme.inactive;
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
  themeObserver?.disconnect();
  themeObserver = null;
}

// Theme change observer — watches platform DOM for light/dark toggles
let themeObserver: MutationObserver | null = null;

/**
 * Watch for theme changes on the host platform and call onThemeChange
 * with the new 'light' | 'dark' value. Also rebuilds the tab bar inline
 * styles to match the new theme.
 */
export function watchThemeChanges(platform: Platform, onThemeChange: (theme: 'light' | 'dark') => void): void {
  themeObserver?.disconnect();
  let lastLight = isLightMode(platform);

  const check = () => {
    const light = isLightMode(platform);
    if (light !== lastLight) {
      lastLight = light;
      // Update module-level theme so tab switching uses correct colors
      activeTheme = light ? THEMES[platform].light : THEMES[platform].dark;
      // Rebuild tab bar styles in place
      rebuildTabBarStyles(activeTheme);
      onThemeChange(light ? 'light' : 'dark');
    }
  };

  themeObserver = new MutationObserver(check);

  switch (platform) {
    case 'twitch':
      // Watch the chat-room section for data-a-target attribute changes
      const chatRoom = document.querySelector('section.chat-room, [data-test-selector="chat-room-component-layout"]');
      if (chatRoom) themeObserver.observe(chatRoom, { attributes: true, attributeFilter: ['data-a-target'] });
      // Also watch body for class changes (tw-root--theme--light)
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      break;
    case 'youtube':
      // Watch <html> for dark attribute toggle
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
      break;
    case 'kick':
      // Watch <html> and <body> for data-theme attribute
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
      break;
  }
}

/**
 * Update the tab bar's inline styles to match a new theme without recreating DOM.
 */
function rebuildTabBarStyles(theme: ThemePalette): void {
  const tabBar = document.getElementById('allchat-tab-bar');
  const allchatTab = document.getElementById('allchat-tab-allchat');
  const nativeTab = document.getElementById('allchat-tab-native');
  const popoutBtn = document.getElementById('allchat-tab-popout');
  if (!tabBar) return;

  tabBar.style.background = theme.bg;
  tabBar.style.borderBottom = `1px solid ${theme.border}`;

  if (allchatTab) {
    const isActive = allchatTab.getAttribute('aria-selected') === 'true';
    allchatTab.style.borderBottom = isActive ? `2px solid ${theme.accent}` : '2px solid transparent';
    allchatTab.style.borderRight = `1px solid ${theme.border}`;
    allchatTab.style.color = isActive ? theme.active : theme.inactive;
    // Update infinity logo stroke
    const svg = allchatTab.querySelector('path');
    if (svg) svg.setAttribute('stroke', theme.accent);
  }

  if (nativeTab) {
    const isActive = nativeTab.getAttribute('aria-selected') === 'true';
    nativeTab.style.borderBottom = isActive ? `2px solid ${theme.accent}` : '2px solid transparent';
    nativeTab.style.color = isActive ? theme.active : theme.inactive;
  }

  if (popoutBtn) {
    popoutBtn.style.borderLeft = `1px solid ${theme.border}`;
    popoutBtn.style.color = theme.inactive;
  }

  // Re-wire hover handlers with new colors
  if (allchatTab) {
    allchatTab.onmouseenter = () => { allchatTab.style.background = theme.hoverBg; };
    allchatTab.onmouseleave = () => { allchatTab.style.background = 'none'; };
  }
  if (nativeTab) {
    nativeTab.onmouseenter = () => { nativeTab.style.background = theme.hoverBg; };
    nativeTab.onmouseleave = () => { nativeTab.style.background = 'none'; };
  }
  if (popoutBtn) {
    popoutBtn.onmouseenter = () => { popoutBtn.style.color = theme.active; };
    popoutBtn.onmouseleave = () => { popoutBtn.style.color = theme.inactive; };
  }
}
