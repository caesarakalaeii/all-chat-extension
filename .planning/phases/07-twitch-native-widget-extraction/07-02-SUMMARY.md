---
phase: 07-twitch-native-widget-extraction
plan: "02"
subsystem: content-script/twitch
tags: [tab-bar, twitch, injection, platform-detector, widget-zones]
dependency_graph:
  requires: []
  provides: [allchat-tab-bar, allchat-widget-zone-top, allchat-iframe-wrapper, allchat-widget-zone-bottom, onIframeCreated-hook]
  affects: [src/content-scripts/twitch.ts, src/content-scripts/base/PlatformDetector.ts]
tech_stack:
  added: []
  patterns: [inline-DOM-construction, flex-column-layout, postMessage-tab-bar-mode, extensionOrigin-targetOrigin]
key_files:
  created: []
  modified:
    - src/content-scripts/twitch.ts
    - src/content-scripts/base/PlatformDetector.ts
decisions:
  - "createInjectionPoint returns #allchat-iframe-wrapper (not #allchat-container) so base injectAllChatUI places iframe in correct flex zone"
  - "onIframeCreated protected hook added to PlatformDetector so TwitchDetector can send TAB_BAR_MODE without access to private injectAllChatUI"
  - "switchToTwitchTab/switchToAllChatTab are module-level functions (not methods) so SWITCH_TO_NATIVE message handler can call them with globalDetector reference"
  - "Tab bar guards in handleSwitchToNative/handleSwitchToAllChat are presence checks (getElementById) not platform checks — works for any future platform that uses a tab bar"
  - "TAB_BAR_MODE uses extensionOrigin as targetOrigin (T-07-03 mitigate)"
metrics:
  duration: "35 minutes"
  completed: "2026-04-12T19:44:00Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 7 Plan 02: Tab Bar Injection and Toggle Logic Summary

Tab bar with [InfinityLogo AllChat] | [Twitch Chat] tabs injected into .chat-shell via content script DOM manipulation; full swap toggle between AllChat and native Twitch chat implemented with connection dot, TAB_BAR_MODE postMessage, and platform-agnostic switch handler guards.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Restructure #allchat-container layout and inject tab bar | 3dd3fc6 | src/content-scripts/twitch.ts, src/content-scripts/base/PlatformDetector.ts |
| 2 | Remove old Switch to AllChat button injection for Twitch | 4042bb5 | src/content-scripts/base/PlatformDetector.ts |

## What Was Built

### Tab Bar (`#allchat-tab-bar`)

Created `createTabBar()` function that builds a 36px absolute-positioned tab bar at the top of `.chat-shell`. Two tab buttons:
- `#allchat-tab-allchat` — InfinityLogo SVG (static, no animation in content script) + "AllChat" text + 6px connection dot (`#allchat-tab-conn-dot`)
- `#allchat-tab-twitch` — "Twitch Chat" text

Styling uses hardcoded OkLCh/hex values matching `src/ui/styles.css` tokens (tab bar lives outside iframe, cannot import CSS bundle). Accessibility: `role="tablist"`, `aria-selected`, `aria-label` per ARIA tab pattern; `:focus-visible` outline support.

### Container Restructure

`createInjectionPoint()` now:
1. Creates `#allchat-tab-bar` and appends to `.chat-shell`
2. Creates `#allchat-container` with `flex-direction: column; padding-top: 36px`
3. Adds three children: `#allchat-widget-zone-top`, `#allchat-iframe-wrapper`, `#allchat-widget-zone-bottom`
4. Returns `#allchat-iframe-wrapper` (not `#allchat-container`) so base `injectAllChatUI` places the iframe in the correct zone

### Tab Switching

`switchToTwitchTab()` / `switchToAllChatTab()` module-level functions handle:
- Show/hide `#allchat-container`
- Remove/restore `#allchat-hide-native-style` via `hideNativeChat()`/`showNativeChat()`
- Update `aria-selected` and border/color active-state styles on both tabs

`SWITCH_TO_NATIVE` postMessage from iframe routes through `switchToTwitchTab()` to keep tab bar state consistent.

### Connection Dot Updates

`updateTabBarConnDot(state)` maps connection states to colors:
- `connected` → `#4ade80` (green)
- `connecting`/`reconnecting` → `#facc15` (yellow)
- `failed` → `#f87171` (red)
- `disconnected` → `oklch(0.35 0.007 270)` (dim)

Called in `setupGlobalMessageRelay` when `CONNECTION_STATE` message arrives.

### TAB_BAR_MODE

`TwitchDetector.onIframeCreated()` overrides the new protected hook in PlatformDetector. On iframe `load`, sends `{ type: 'TAB_BAR_MODE', enabled: true }` with `extensionOrigin` as `targetOrigin` (T-07-03 mitigation).

### PlatformDetector Guards (Task 2)

`handleSwitchToNative()` and `handleSwitchToAllChat()` in PlatformDetector now check for `document.getElementById('allchat-tab-bar')` before injecting/removing the fallback button. YouTube and Kick retain the button; Twitch (which has the tab bar) skips it.

## Decisions Made

- **`createInjectionPoint` returns iframeWrapper**: Cleaner than overriding `injectAllChatUI` — base class naturally places iframe in the right slot
- **`onIframeCreated` protected hook**: Avoids making `injectAllChatUI` public or non-private; subclasses can extend without accessing private method
- **Tab bar guards use `getElementById` not platform check**: Future-proof — any platform with a tab bar auto-skips the button
- **TAB_BAR_MODE uses `extensionOrigin` targetOrigin**: Per T-07-03 threat mitigate disposition in plan

## Deviations from Plan

### Auto-added Missing Functionality

**1. [Rule 2 - Missing] `onIframeCreated` hook added to PlatformDetector**
- **Found during:** Task 1 — plan says to send TAB_BAR_MODE "after iframe loads" but `injectAllChatUI` is `private` with no extension point
- **Fix:** Added `protected onIframeCreated(iframe: HTMLIFrameElement): void` no-op hook called from `injectAllChatUI`; TwitchDetector overrides it
- **Files modified:** `src/content-scripts/base/PlatformDetector.ts`
- **Commit:** 3dd3fc6

None — plan executed as written with one necessary structural addition to enable the TAB_BAR_MODE delivery mechanism.

## Known Stubs

None. All implemented functionality is wired end-to-end. `#allchat-widget-zone-top` and `#allchat-widget-zone-bottom` are empty zones (Plan 07-04 will populate them with cloned Twitch widgets — this is intentional, documented in PLAN.md).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| — | — | No new threat surface introduced beyond what is in the plan's threat model |

T-07-03 (TAB_BAR_MODE spoofing) is mitigated: `extensionOrigin` is used as `targetOrigin` in `onIframeCreated`.

## Self-Check: PASSED

Files created/modified:
- `src/content-scripts/twitch.ts` — FOUND (contains allchat-tab-bar, allchat-tab-allchat, allchat-tab-twitch, padding-top: 36px, TAB_BAR_MODE, allchat-tab-conn-dot)
- `src/content-scripts/base/PlatformDetector.ts` — FOUND (contains allchat-tab-bar guard, injectSwitchToAllChatButton, removeSwitchToAllChatButton)

Commits:
- `3dd3fc6` — FOUND (Task 1: tab bar injection + onIframeCreated hook)
- `4042bb5` — FOUND (Task 2: switch handler guards)

Build: webpack 5 compiled with 0 errors (2 pre-existing warnings: screenshot size, bundle size recommendation)

Tests: 16/17 static and E2E tests passed; 1 pre-existing failure (`test-duplicate-messages` checks for `handleMessage` variable name but code uses `messageHandler` — exists on `main` branch, unrelated to this plan).
