---
phase: 01-dom-slot-injection
plan: "02"
subsystem: ui
tags: [twitch, content-scripts, dom, slot-injection, typescript, mutation-observer]

# Dependency graph
requires:
  - phase: 01-dom-slot-injection
    plan: "01"
    provides: "PlatformDetector.waitForElement(), teardown(), async createInjectionPoint() signature"
provides:
  - "TwitchDetector.createInjectionPoint() async — appends #allchat-container inside .chat-shell"
  - "Scoped MutationObserver on .chat-shell parent (childList:true, subtree:false)"
  - "TwitchDetector.teardown() override — disconnects slotObserver then super.teardown()"
  - "setupUrlWatcher() with immediate teardown() on URL change (no setTimeout delay)"
  - "TWITCH_INIT_DELAY constant removed — timing via waitForElement()"
affects:
  - 01-03 (YouTube plan — parallel wave, same injection pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Slot injection pattern: await waitForElement(slot), appendChild(container) to slot"
    - "Scoped observer pattern: observe slotParent not document.body, subtree:false"
    - "Teardown-first SPA navigation: teardown() immediately on URL change before re-init"

key-files:
  created: []
  modified:
    - src/content-scripts/twitch.ts
    - tests/test-slot-injection.spec.ts

key-decisions:
  - "UI_COLLAPSED handler removed — .chat-shell controls dimensions, fixed pixels are incompatible with slot injection"
  - "slotObserver is module-level let (not class property) — accessible from both createInjectionPoint and teardown override"
  - "setupMutationObserver() function removed entirely — replaced by scoped slotObserver inside createInjectionPoint"

patterns-established:
  - "slot-injection: container appended to .chat-shell not document.body; style width:100%;height:100%; only"
  - "teardown-first-on-navigate: teardown() called before init() on URL change — prevents double containers"

requirements-completed:
  - INJ-01
  - INJ-02
  - INJ-03
  - INJ-08

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 1 Plan 02: Twitch Slot Injection Summary

**TwitchDetector rewired to mount #allchat-container inside .chat-shell via async waitForElement(), eliminating position:fixed overlay and replacing document.body-scoped MutationObserver with slot-parent-scoped observer**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-12T14:18:08Z
- **Completed:** 2026-03-12T14:21:17Z
- **Tasks:** 1 of 2 completed (Task 2 is checkpoint:human-verify)
- **Files modified:** 2

## Accomplishments

- Rewrote `createInjectionPoint()` as async — awaits `.chat-shell` via `this.waitForElement()`, appends container with `width:100%; height:100%` (no fixed position, no hardcoded pixels)
- Replaced global `setupMutationObserver()` with a scoped observer on `slot.parentElement` with `{ childList: true, subtree: false }` — fires only when chat-shell is removed/added
- Added `TwitchDetector.teardown()` override — disconnects `slotObserver`, nulls it, then calls `super.teardown()` for container/style cleanup
- Removed `TWITCH_INIT_DELAY` constant and both `setTimeout(init, delay)` call sites — `waitForElement` handles timing
- Removed `UI_COLLAPSED` message handler that set fixed-pixel width/height/top on container (incompatible with slot injection)
- Updated `setupUrlWatcher()` to call `teardown()` immediately on URL change before `init()`
- Un-skipped INJ-01 and INJ-02 Playwright test stubs (TDD RED committed before implementation)

## Task Commits

Each task was committed atomically:

1. **TDD RED: Un-skip INJ-01, INJ-02 tests** - `8cf39e1` (test)
2. **Task 1: Rewrite TwitchDetector — slot injection, scoped observer, teardown** - `b2ef9fd` (feat)

**Plan metadata:** (docs commit to follow)

_Note: Task 2 is checkpoint:human-verify — awaiting manual browser verification_

## Files Created/Modified

- `src/content-scripts/twitch.ts` - Rewrote createInjectionPoint() as async slot injection, added teardown() override, removed TWITCH_INIT_DELAY and UI_COLLAPSED handler, replaced setupMutationObserver() with scoped slot observer
- `tests/test-slot-injection.spec.ts` - Removed test.skip from INJ-01 and INJ-02 test cases

## Decisions Made

- `UI_COLLAPSED` message handler removed — the `.chat-shell` parent controls container dimensions in slot injection mode; setting fixed pixel dimensions would fight the layout
- `slotObserver` kept as module-level `let` (not a class property) because `teardown()` is called as a function and needs module scope access; TDD confirmed no naming conflicts
- `setupMutationObserver()` standalone function removed entirely — replaced by inline setup inside `createInjectionPoint()` where `slot` reference is available

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- INJ-01 Playwright test cannot pass via `file://` fixture URL because the content script manifest only matches `https://www.twitch.tv/*`. Test is un-skipped (desired behavior documented) but requires human verification against a live Twitch page or a properly configured test HTTP server. This is a pre-existing architectural limitation of the test stubs from plan 01-01, not introduced by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/content-scripts/twitch.ts` is ready for human browser verification (Task 2: checkpoint:human-verify)
- After approval, plan 01-03 (YouTube slot injection) can proceed in parallel or sequence
- Pre-existing TypeScript error in `youtube.ts` (sync `createInjectionPoint()` vs async signature) will be resolved by plan 01-03

## Self-Check: PASSED

All created/modified files confirmed present on disk. Both task commits (8cf39e1, b2ef9fd) confirmed in git log.

---
*Phase: 01-dom-slot-injection*
*Completed: 2026-03-12*
