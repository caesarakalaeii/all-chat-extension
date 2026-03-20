---
phase: 03-kick-platform
plan: 03
subsystem: content-scripts
tags: [kick, spa-navigation, content-script, iframe-injection, fetch-api]

# Dependency graph
requires:
  - phase: 03-kick-platform-01
    provides: test fixtures and stubs for Kick platform tests
  - phase: 03-kick-platform-02
    provides: message relay hardening with extensionOrigin pattern
  - phase: 01-dom-slot-injection
    provides: PlatformDetector abstract base class + waitForElement + teardown/init flow
provides:
  - KickDetector content script with API-based live detection and DOM slot injection
  - API-based live stream detection via kick.com/api/v2/channels/{slug}
  - SPA navigation handling with popstate + MutationObserver on title element
  - Global message relay for Kick iframes using extensionOrigin
affects:
  - 03-kick-platform-04 (webpack entry for kick.ts added in next plan)
  - Phase 04 (TikTok platform — same patterns apply)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - API-based live detection (fetch kick.com/api/v2) instead of DOM live badge
    - Selector fallback chain with date-comments in createInjectionPoint
    - SPA navigation: popstate + MutationObserver on title (not pushState monkey-patch)
    - hideNativeChat targets slot children not slot itself — preserves #allchat-container

key-files:
  created:
    - src/content-scripts/kick.ts
  modified: []

key-decisions:
  - "API-based live detection — no stable DOM live badge selector on Kick as of 2026-03-12; fetch kick.com/api/v2/channels/{slug} and check data.livestream !== null"
  - "hideNativeChat targets #channel-chatroom > *:not(#allchat-container) — hiding the slot itself would destroy the injected container"
  - "Only #channel-chatroom confirmed present on live Kick.com; #chatroom and .chatroom-wrapper kept as silent fallbacks in SELECTORS array"

patterns-established:
  - "API live check pattern: async isLiveStream() fetches platform API before DOM slot injection"
  - "Selector fallback chain: try each selector with try/catch waitForElement, break on first success"
  - "MutationObserver on title for SPA navigation — not pushState monkey-patch (isolated content script scope)"

requirements-completed: [KICK-01, KICK-02, KICK-06, KICK-07]

# Metrics
duration: 15min
completed: 2026-03-12
---

# Phase 3 Plan 03: Kick Content Script Summary

**KickDetector content script with API-based live detection (kick.com/api/v2), #channel-chatroom slot injection, and popstate + title MutationObserver SPA navigation**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-12T17:10:00Z
- **Completed:** 2026-03-12T17:25:00Z
- **Tasks:** 2 (1 checkpoint from prior session, 1 implementation)
- **Files modified:** 1

## Accomplishments
- KickDetector class implementing all 6 PlatformDetector abstract methods
- API-based live stream detection replaces unreliable DOM live badge detection
- Selector fallback chain with date-comments; only #channel-chatroom confirmed on live Kick
- SPA navigation via popstate + MutationObserver on title with URL deduplication
- All postMessage calls use extensionOrigin (not '*')
- TypeScript compiles with zero errors; build succeeds; 10 Kick test stubs all skip

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify Kick DOM selectors** - checkpoint resolved (prior session)
2. **Task 2: Implement src/content-scripts/kick.ts** - `7b45a37` (feat)

**Plan metadata:** `[docs commit hash]` (docs: complete plan)

## Files Created/Modified
- `src/content-scripts/kick.ts` - KickDetector class with all platform methods, API live detection, SPA navigation watcher, global message relay

## Decisions Made
- **API live detection:** No stable DOM live badge selector exists on Kick.com as of 2026-03-12 (confirmed during Task 1 checkpoint). Using `fetch('https://kick.com/api/v2/channels/{slug}')` — `data.livestream !== null` indicates live.
- **hideNativeChat targets children not slot:** `#channel-chatroom > *:not(#allchat-container) { display: none }` rather than hiding the entire `#channel-chatroom` element, which would destroy the injected container.
- **Fallback selectors kept:** `#chatroom` and `.chatroom-wrapper` are absent on current Kick DOM but retained in the SELECTORS array as silent fallbacks in case Kick re-adds them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] isLiveStream() changed from sync to async for API fetch**
- **Found during:** Task 2 (implementation)
- **Issue:** Plan specified DOM-based two-tier live detection (`[data-state="live"]` badge + chat slot visibility). Checkpoint resolution confirmed no stable live badge selector exists. API-based detection requires async fetch.
- **Fix:** Made `isLiveStream()` async, updated `init()` and `setupUrlWatcher()` to await it. TypeScript compiles without errors.
- **Files modified:** src/content-scripts/kick.ts
- **Verification:** `npx tsc --noEmit` → exit 0; `npm run build` → success
- **Committed in:** 7b45a37 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — live detection mechanism changed per checkpoint confirmation)
**Impact on plan:** Required by checkpoint findings. API detection is more reliable than DOM badge scraping. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- kick.ts is complete and compiles cleanly
- Plan 04 (webpack entry + manifest update) can proceed — adds kick.ts as webpack entry point and registers the content script in manifest.json
- All three Kick platform content-script tests remain skip-skeletons awaiting full Playwright integration in Plan 04

---
*Phase: 03-kick-platform*
*Completed: 2026-03-12*
