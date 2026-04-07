---
phase: 06-add-pop-out-button-for-standalone-chat-overlay
plan: "05"
subsystem: content-scripts, ui
tags: [pop-out, native-popout, bidirectional-switch, manifest, twitch, youtube, kick]
dependency_graph:
  requires:
    - src/content-scripts/base/PlatformDetector.ts (from Plan 03)
    - src/ui/components/ChatContainer.tsx (from Plan 02)
  provides:
    - Native pop-out "Switch to AllChat" button for Twitch (/popout/{channel}/chat)
    - Native pop-out "Switch to AllChat" button for YouTube (/live_chat)
    - "Switch to native" direct navigation in AllChat pop-out mode
    - Manifest coverage for YouTube /live_chat URL
  affects:
    - manifest.json
    - src/content-scripts/twitch.ts
    - src/content-scripts/youtube.ts
    - src/content-scripts/kick.ts
    - src/ui/components/ChatContainer.tsx
tech_stack:
  added: []
  patterns:
    - injectNativePopoutSwitchButton module-level function (content scripts)
    - window.location.href navigation for pop-out mode switching
    - getNativePopoutUrl pure helper for platform-to-native-popout URL mapping
key_files:
  created: []
  modified:
    - manifest.json
    - src/content-scripts/twitch.ts
    - src/content-scripts/youtube.ts
    - src/content-scripts/kick.ts
    - src/ui/components/ChatContainer.tsx
decisions:
  - "injectNativePopoutSwitchButton is a module-level function (not a class method) — it runs in native pop-out context before any PlatformDetector is created, so it cannot be a class method"
  - "Twitch injectNativePopoutSwitchButton sets twitch_channel param to streamer — both are the channel name in /popout/{channel}/chat URL, matching PlatformDetector.handlePopoutRequest behavior"
  - "YouTube injectNativePopoutSwitchButton omits twitch_channel param — not applicable for YouTube pop-out"
  - "getNativePopoutUrl returns null for kick (no known URL, D-16) — handleSwitchToNative silently no-ops for Kick in pop-out mode"
  - "isNativePopout detection in initialize() returns early — prevents full AllChat injection into native pop-out pages"
metrics:
  duration: "10 minutes"
  completed: "2026-04-07T10:30:00Z"
  tasks_completed: 1
  files_changed: 5
requirements:
  - D-11
  - D-12
  - D-13
  - D-16
---

# Phase 6 Plan 05: Native Pop-Out Switch Buttons and Bidirectional Navigation Summary

**One-liner:** "Switch to AllChat" button injected into Twitch/YouTube native pop-out pages, with bidirectional navigation via direct window.location.href in pop-out mode and manifest coverage for YouTube /live_chat URL.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update manifest and add native pop-out detection to Twitch and YouTube | 1fb4d68 | manifest.json, src/content-scripts/twitch.ts, src/content-scripts/youtube.ts, src/content-scripts/kick.ts, src/ui/components/ChatContainer.tsx |

## What Was Built

### manifest.json

Added `"https://www.youtube.com/live_chat*"` to the YouTube content_scripts matches array. This ensures the YouTube content script is injected on native YouTube pop-out chat pages (`/live_chat?v=...`), which was previously uncovered. The `web_accessible_resources` entry already covers `https://www.youtube.com/*` so no changes were needed there.

### src/content-scripts/twitch.ts

Added `injectNativePopoutSwitchButton()` as a module-level function. It creates a fixed-position button (bottom-right, `#allchat-native-popout-btn`) with AllChat's infinity SVG logo and "Switch to AllChat" text. Clicking it builds a URL with `chrome.runtime.getURL('ui/chat-container.html?...')` including `platform`, `streamer`, `display_name`, `popout=1`, and `twitch_channel` params, then navigates via `window.location.href`.

In `initialize()`, added detection for `/popout/{channel}/chat` URL pattern immediately after the platform-enabled check. When detected, the function injects the switch button and returns early — no full AllChat UI is created in the native pop-out window.

### src/content-scripts/youtube.ts

Added the same `injectNativePopoutSwitchButton()` function (without the `twitch_channel` param). In `initialize()`, added detection for `/live_chat` and `/live_chat_replay` pathnames after the platform-enabled check. The video ID is extracted from the `v` URL parameter and passed as both `streamer` and `display_name`. Returns early after button injection.

### src/content-scripts/kick.ts

Added a D-16 comment block in `initialize()` explaining that Kick has no known native pop-out URL, the feature is deferred per research outcome (not intentionally skipped), and to re-evaluate if Kick adds pop-out support.

### src/ui/components/ChatContainer.tsx

Added `getNativePopoutUrl()` pure helper function (outside the component) that returns the platform-native pop-out URL:
- `twitch` → `https://www.twitch.tv/popout/{twitchChannel||streamer}/chat`
- `youtube` → `https://www.youtube.com/live_chat?v={streamer}&is_popout=1`
- `kick` / default → `null`

Updated `handleSwitchToNative` to branch on `isPopOut`: in pop-out mode, calls `getNativePopoutUrl()` and navigates via `window.location.href` (D-13); in in-page mode, sends `SWITCH_TO_NATIVE` postMessage as before.

## Verification

- `npx tsc --noEmit` — exits 0, zero errors
- `npm test -- --grep-invert @agent` — 50 passed, 16 pre-existing failures (same set as Plan 04), 12 skipped; no regressions introduced

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all implemented functionality is complete. The `handleSwitchToNative` in pop-out mode silently no-ops for Kick (returns null from `getNativePopoutUrl`) which is correct behavior per D-16.

## Threat Flags

No new security surfaces beyond those documented in the plan's threat model:
- T-06-11: `injectNativePopoutSwitchButton` click handler navigates to `chrome.runtime.getURL(...)` only — URL is computed by extension, not from DOM input. Platform/streamer values come from URL parsing.
- T-06-12: Injected button uses extension-controlled SVG/styling. Malicious page cannot extract credentials — button only navigates to extension page.
- T-06-13: Streamer username already visible in page URL — no additional exposure.

## Self-Check: PASSED

Files modified:
- manifest.json — contains `live_chat*` — FOUND
- src/content-scripts/twitch.ts — contains `injectNativePopoutSwitchButton`, `allchat-native-popout-btn`, `popoutMatch` in initialize() — FOUND
- src/content-scripts/youtube.ts — contains `injectNativePopoutSwitchButton`, `isNativePopout` in initialize() — FOUND
- src/content-scripts/kick.ts — contains D-16 comment — FOUND
- src/ui/components/ChatContainer.tsx — contains `getNativePopoutUrl`, `window.location.href` in handleSwitchToNative — FOUND

Commits:
- 1fb4d68 — FOUND
