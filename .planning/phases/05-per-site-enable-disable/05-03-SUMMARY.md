---
phase: 05-per-site-enable-disable
plan: 03
subsystem: popup-ui
tags: [chrome-extension, react, popup, per-platform-toggle, icon-management]

# Dependency graph
requires:
  - phase: 05-per-site-enable-disable
    plan: 01
    provides: PlatformEnabled type and getSyncStorage migration

provides:
  - Popup with three per-platform toggle rows (Twitch, YouTube, Kick)
  - Active platform row highlighted with platform-colored left border
  - handlePlatformToggle sending EXTENSION_STATE_CHANGED to platform-specific tabs only
  - Service worker SET_CURRENT_PLATFORM handler with per-tab color/grayscale icon switching
  - onInstalled update branch triggers read-time migration via getSyncStorage()

affects: [05-04, popup, service-worker, content-scripts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Per-platform toggle state replacing global enable/disable boolean
    - Icon path switching (color/grayscale) per tab based on platformEnabled state
    - data-platform attribute on DOM elements for CSS platform-specific targeting

key-files:
  created: []
  modified:
    - src/popup/popup.tsx
    - src/popup/popup.html
    - src/background/service-worker.ts

key-decisions:
  - "popup.tsx: handlePlatformToggle queries only platform-specific tab URLs (D-04 no-reload requirement)"
  - "popup.tsx: Icon update in popup (not just service worker) for immediate visual feedback after toggle"
  - "service-worker.ts: Block-scoped const in SET_CURRENT_PLATFORM case to avoid let-in-switch issues"
  - "service-worker.ts: getSyncStorage() call in update branch triggers automatic read-time migration"

patterns-established:
  - "Pattern: Per-platform chrome.tabs.query with PLATFORM_URLS map for targeted message dispatch"

requirements-completed: [D-03, D-04, D-05, D-07, D-08]

# Metrics
duration: 10min
completed: 2026-04-03
---

# Phase 05 Plan 03: Popup Per-Platform Toggles and Service Worker Icon Management Summary

**Three per-platform toggle rows with active row highlighting and per-tab grayscale icon switching in service worker**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-03
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced single global `isEnabled`/`handleToggle` with `platformEnabled` state and `handlePlatformToggle` across all three platforms (D-03)
- Each platform toggle sends `EXTENSION_STATE_CHANGED` only to that platform's tabs — no `chrome.tabs.reload` calls remain (D-04)
- Current platform row highlighted with a platform-colored left border accent via `data-platform` attribute and CSS `[data-platform]` selectors (D-05)
- Popup also updates the toolbar icon color/grayscale immediately on toggle for affected tabs
- Removed redundant "Supported Platforms" section — platforms listed in toggle rows
- Service worker `SET_CURRENT_PLATFORM` handler sets color or grayscale icon per-tab based on `platformEnabled` state (D-07)
- onInstalled update branch calls `getSyncStorage()` to trigger read-time migration for existing users (D-08)
- TypeScript compiles cleanly (`npx tsc --noEmit` passes with zero errors)
- All 16 @phase5 Playwright tests pass, 11 stubs remain skipped (no regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite popup.tsx with per-platform toggles and add popup.html CSS** - `57b99c1` (feat)
2. **Task 2: Update service worker — grayscale icon on SET_CURRENT_PLATFORM + onInstalled defaults** - `4842c51` (feat)

## Files Created/Modified

- `src/popup/popup.tsx` — Replaced `isEnabled`/`handleToggle` with `platformEnabled`/`handlePlatformToggle`; three toggle rows with `data-platform` attribute; `EXTENSION_STATE_CHANGED` dispatch; no `chrome.tabs.reload`
- `src/popup/popup.html` — Added `.platform-row`, `.platform-row--active`, `[data-platform]` border-color CSS rules
- `src/background/service-worker.ts` — `SET_CURRENT_PLATFORM` sets per-tab icon; `update` branch triggers migration

## Decisions Made

- `handlePlatformToggle` queries platform-specific tab URLs via `PLATFORM_URLS` map — targets only affected tabs (D-04)
- Popup also sets icons on toggle (not just service worker) — immediate feedback without waiting for next navigation
- Block-scoped `const` with braces in `SET_CURRENT_PLATFORM` case — avoids lexical declaration errors in switch

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/popup/popup.tsx` contains `platformEnabled` state — FOUND
- [x] `src/popup/popup.tsx` does NOT contain `isEnabled` state — CONFIRMED
- [x] `src/popup/popup.tsx` does NOT contain `handleToggle` — CONFIRMED
- [x] `src/popup/popup.tsx` does NOT contain `chrome.tabs.reload` — CONFIRMED
- [x] `src/popup/popup.tsx` does NOT contain `extensionEnabled` — CONFIRMED
- [x] `src/popup/popup.tsx` contains `handlePlatformToggle` — FOUND
- [x] `src/popup/popup.tsx` contains `EXTENSION_STATE_CHANGED` — FOUND
- [x] `src/popup/popup.tsx` contains `Platform Settings` — FOUND
- [x] `src/popup/popup.tsx` contains `platform-row--active` — FOUND
- [x] `src/popup/popup.tsx` contains `chrome.action.setIcon` — FOUND
- [x] `src/popup/popup.tsx` contains `data-platform={p}` — FOUND
- [x] `src/popup/popup.html` contains `.platform-row` CSS — FOUND
- [x] `src/popup/popup.html` contains `.platform-row--active` CSS — FOUND
- [x] `src/popup/popup.html` contains `border-left-color: #9147ff` — FOUND
- [x] `src/popup/popup.html` contains `border-left-color: #FF4444` — FOUND
- [x] `src/popup/popup.html` contains `border-left-color: #53FC18` — FOUND
- [x] `src/background/service-worker.ts` SET_CURRENT_PLATFORM contains `chrome.action.setIcon` — FOUND
- [x] `src/background/service-worker.ts` contains `icon-16-gray.png` — FOUND
- [x] `src/background/service-worker.ts` contains `settings.platformEnabled` — FOUND
- [x] `src/background/service-worker.ts` does NOT contain `extensionEnabled` — CONFIRMED
- [x] `src/background/service-worker.ts` update handler calls `getSyncStorage()` — FOUND
- [x] Commit `57b99c1` exists — VERIFIED
- [x] Commit `4842c51` exists — VERIFIED
- [x] TypeScript: PASS
- [x] Playwright @phase5: 16 passed, 11 skipped
