---
phase: 06-add-pop-out-button-for-standalone-chat-overlay
plan: "04"
subsystem: content-scripts
tags: [pop-out, content-scripts, message-relay, twitch, youtube, kick]
dependency_graph:
  requires: ["06-02", "06-03"]
  provides: ["06-05"]
  affects:
    - src/content-scripts/twitch.ts
    - src/content-scripts/youtube.ts
    - src/content-scripts/youtube-studio.ts
    - src/content-scripts/kick.ts
tech_stack:
  added: []
  patterns:
    - postMessage origin guard (extensionOrigin check) before pop-out handlers
    - Regex-based Twitch /popout/{channel}/chat URL extraction
key_files:
  created: []
  modified:
    - src/content-scripts/twitch.ts
    - src/content-scripts/youtube.ts
    - src/content-scripts/youtube-studio.ts
    - src/content-scripts/kick.ts
decisions:
  - "extensionOrigin guard placed before POPOUT_REQUEST/SWITCH_TO_NATIVE/CLOSE_POPOUT handlers — mitigates T-06-09 spoofing threat by rejecting messages from non-extension origins"
  - "Kick message listener now derives extensionOrigin at call site (was missing in original) — consistent with other scripts and required for origin guard to work"
  - "CLOSE_POPOUT handler notifies iframes via postMessage after calling closePopout() — ensures banner clears even if polling interval fires late"
metrics:
  duration: "15min"
  completed: "2026-04-07T10:00:00Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 06 Plan 04: Content Script Pop-Out Message Wiring Summary

POPOUT_REQUEST, SWITCH_TO_NATIVE, and CLOSE_POPOUT message handlers wired into all four platform content scripts, with extensionOrigin validation and Twitch /popout/ URL extraction fix.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire pop-out messages into Twitch and YouTube content scripts | a20c848 | src/content-scripts/twitch.ts, src/content-scripts/youtube.ts |
| 2 | Wire pop-out messages into YouTube Studio and Kick content scripts | 3211403 | src/content-scripts/youtube-studio.ts, src/content-scripts/kick.ts |

## What Was Built

### Task 1 — Twitch and YouTube

**`src/content-scripts/twitch.ts`:**
- Fixed `extractStreamerUsername()` to handle `/popout/{channel}/chat` URL pattern — added regex match `^\/popout\/([^/]+)\/chat` before the standard match, returns the channel name instead of "popout"
- Added `'popout'` to the excluded paths array as a safety net
- Added `POPOUT_REQUEST`, `SWITCH_TO_NATIVE`, `CLOSE_POPOUT` handlers in `setupGlobalMessageRelay` window message listener
- Added `event.origin !== extensionOrigin` guard before the new handlers (T-06-09 mitigation)
- `CLOSE_POPOUT` handler calls `closePopout()` then broadcasts `POPOUT_CLOSED` to all `iframe[data-platform="twitch"]` iframes

**`src/content-scripts/youtube.ts`:**
- Same three pop-out message handlers added to `setupGlobalMessageRelay` window message listener
- Same `extensionOrigin` origin guard applied
- `CLOSE_POPOUT` handler targets `iframe[data-platform="youtube"]`

### Task 2 — YouTube Studio and Kick

**`src/content-scripts/youtube-studio.ts`:**
- Same three handlers added
- `CLOSE_POPOUT` uses generic `iframe[data-platform]` selector (platform value may vary in Studio context)

**`src/content-scripts/kick.ts`:**
- Same three handlers added
- `extensionOrigin` constant moved to top of window message listener (was absent, now consistent with other scripts)
- `CLOSE_POPOUT` targets `iframe[data-platform="kick"]`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Added extensionOrigin origin guard to pop-out handlers**
- **Found during:** Task 1
- **Issue:** Plan's threat model T-06-09 requires origin validation for POPOUT_REQUEST and related handlers. The plan description stated "Content scripts already validate message origin" but the actual code had no origin check in the window message listener for any of the four scripts.
- **Fix:** Added `if (event.origin !== extensionOrigin) return;` immediately before the three new pop-out handlers in all four scripts. The existing GET_CONNECTION_STATE and REQUEST_LOGIN handlers are not guarded (they predate this plan and are out of scope).
- **Files modified:** All four content scripts
- **Commits:** a20c848, 3211403

**2. [Rule 1 - Bug] Added extensionOrigin variable to Kick message listener**
- **Found during:** Task 2
- **Issue:** Kick's `window.addEventListener('message', ...)` callback was missing the `extensionOrigin` constant declaration (it only had it inside the `GET_CONNECTION_STATE` handler). The origin guard requires it at the top level of the listener.
- **Fix:** Moved `const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);` to the top of the Kick message listener callback, consistent with Twitch and YouTube patterns.
- **Files modified:** src/content-scripts/kick.ts
- **Commit:** 3211403

## Known Stubs

None — all handlers are fully implemented and delegate to PlatformDetector base class methods. The switch-native test file (`tests/test-switch-native.spec.ts`) contains two `test.skip` stubs for POP-06 and POP-07, but those are placeholders for a future E2E test plan, not stubs in this plan's deliverables.

## Threat Flags

No new security surfaces introduced. The origin guard added in this plan strengthens the existing message listener boundary at the iframe postMessage → content script trust boundary.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| twitch.ts POPOUT_REQUEST handler | FOUND |
| twitch.ts SWITCH_TO_NATIVE handler | FOUND |
| twitch.ts CLOSE_POPOUT handler | FOUND |
| twitch.ts /popout/{channel}/chat regex | FOUND |
| twitch.ts 'popout' in excluded array | FOUND |
| youtube.ts POPOUT_REQUEST handler | FOUND |
| youtube.ts SWITCH_TO_NATIVE handler | FOUND |
| youtube.ts CLOSE_POPOUT handler | FOUND |
| youtube-studio.ts POPOUT_REQUEST handler | FOUND |
| youtube-studio.ts SWITCH_TO_NATIVE handler | FOUND |
| youtube-studio.ts CLOSE_POPOUT handler | FOUND |
| kick.ts POPOUT_REQUEST handler | FOUND |
| kick.ts SWITCH_TO_NATIVE handler | FOUND |
| kick.ts CLOSE_POPOUT handler | FOUND |
| tsc --noEmit | PASS (0 errors) |
| npm test --grep-invert @agent | 49 passed, 17 pre-existing failures, no regressions introduced |
| Commit a20c848 exists | FOUND |
| Commit 3211403 exists | FOUND |
