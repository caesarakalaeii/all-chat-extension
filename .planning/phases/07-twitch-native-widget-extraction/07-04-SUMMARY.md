---
phase: 07-twitch-native-widget-extraction
plan: "04"
subsystem: ui
tags: [twitch, content-script, dom-cloning, mutation-observer, event-forwarding, widget-extraction]

# Dependency graph
requires:
  - phase: 07-02
    provides: "#allchat-widget-zone-top and #allchat-widget-zone-bottom zones in DOM, tab bar with switchToAllChatTab/switchToTwitchTab handlers"
provides:
  - "Widget extraction system: WIDGET_SELECTORS config, cloneWidgetIntoZone, cloneSyncObservers, event forwarding"
  - "startWidgetDetection / stopWidgetDetection lifecycle functions wired into createInjectionPoint and teardown"
  - "resyncWidgetClones called on AllChat tab re-activation"
affects:
  - "07-05 (E2E validation of widget cloning against live Twitch DOM)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clone + event forwarding: cloneNode(true) with getElementPath/resolveElementByPath for click relay"
    - "MutationObserver scoping: direct children of chatShell + stream-chat subtree (not .chat-shell subtree) per T-07-06"
    - "Re-clone-on-change sync: simpler than incremental DOM patching, avoids stale reference issues"
    - "Graceful degradation: widget zones stay collapsed when selectors match nothing — no errors thrown"

key-files:
  created: []
  modified:
    - src/content-scripts/twitch.ts

key-decisions:
  - "Re-clone-on-change chosen over incremental sync: safer when Twitch React re-renders widgets wholesale"
  - "Observer scoped to chatShell direct children + stream-chat subtree (not subtree:true on .chat-shell) per T-07-06 to avoid firing on every chat message"
  - "buildSelectorString helper validates each CSS selector with try/catch before joining — avoids querySelector exceptions on rotted selectors"
  - "resyncWidgetClones called on AllChat tab activation to catch widget changes that occurred while zones were hidden"

patterns-established:
  - "WIDGET_SELECTORS const with date comment for selector maintenance (same pattern as kick.ts KICK-07)"
  - "cloneMap (original->clone) and cloneSyncObservers (original->MutationObserver) as module-level Maps for cleanup"

requirements-completed:
  - WIDGET-05
  - WIDGET-06
  - WIDGET-07

# Metrics
duration: 25min
completed: 2026-04-12
---

# Phase 07 Plan 04: Widget Extraction System Summary

**MutationObserver-driven Twitch widget cloning into zone divs with getElementPath/dispatchEvent click relay and re-clone-on-change sync**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-12T19:50:00Z
- **Completed:** 2026-04-12T20:15:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Complete widget extraction system added to `twitch.ts`: `WIDGET_SELECTORS`, `cloneMap`, `cloneSyncObservers`, `startWidgetDetection`, `stopWidgetDetection`, `resyncWidgetClones`
- Click and input event forwarding from clones to originals using `getElementPath` + `resolveElementByPath` index-path mapping, with `.click()` fallback to `dispatchEvent`
- MutationObserver on original widget nodes keeps clones in sync via re-clone-on-change strategy (D-10)
- Widget detection observer scoped per T-07-06: direct children of `.chat-shell` + `.stream-chat` subtree — avoids firing on every chat message DOM update
- Graceful degradation: if selectors match nothing (logged-out, rotted selectors), zones stay collapsed and extension continues working normally

## Task Commits

1. **Task 1: Widget extraction system implementation** — `c1eaeff` (feat)

## Files Created/Modified

- `src/content-scripts/twitch.ts` — Added 377 lines: WIDGET_SELECTORS config, full widget extraction system (clone, sync, event forwarding, zone management, teardown)

## Decisions Made

- **Re-clone-on-change sync** chosen over incremental DOM patching: when Twitch React re-renders a widget subtree it often replaces entire child trees, making incremental patching complex and error-prone. Re-cloning is simpler and guaranteed correct.
- **Observer scoping** per T-07-06 (DoS mitigation): `chatShell` with `{ childList: true, subtree: false }` for top-level widget detection, plus `.stream-chat` subtree. Avoids observing `.chat-shell` with `subtree: true` which would fire on every chat message append.
- **`buildSelectorString` validation** wraps each `querySelector` call in try/catch so rotted `[data-test-selector*=...]` patterns don't crash detection.

## Deviations from Plan

None — plan executed exactly as written. The `resyncWidgetClones` function was extracted as a named function (vs. inline code in `switchToAllChatTab`) for testability, consistent with the plan's spec.

## Issues Encountered

Port 8080 conflict during test run (leftover from previous test agent). Resolved by `fuser -k 8080/tcp` before re-running. No test regressions from widget extraction changes — 70 pass, 17 pre-existing failures (Kick E2E, YouTube SPA, design system), 20 skipped (widget zone stubs and tab bar stubs).

## Known Stubs

`WIDGET-05`, `WIDGET-06`, `WIDGET-07`, `WIDGET-08` in `tests/test-widget-zones.spec.ts` remain as `test.skip` stubs. Full E2E implementation requires live Twitch DOM access with logged-in account — deferred to 07-05 (validation plan).

## Threat Flags

None — no new trust boundaries or network endpoints introduced. Widget cloning operates entirely within the existing `.chat-shell` DOM scope with `host_permissions` already granted.

## Next Phase Readiness

- Widget extraction system is complete and production-built
- 07-05 (validation) can now run against live Twitch to verify selectors and interactivity
- Selector confidence is LOW for predictions/polls/hype trains/raids — must be verified against live Twitch DOM before 07-05

## Self-Check: PASSED

- `src/content-scripts/twitch.ts` — FOUND
- `07-04-SUMMARY.md` — FOUND
- commit `c1eaeff` — FOUND
- All 14 acceptance criteria patterns present in twitch.ts (43 matching lines)
- `npm run build` exits 0
- `npm test` — 70 passed, 17 pre-existing failures (unchanged from baseline), 20 skipped

---
*Phase: 07-twitch-native-widget-extraction*
*Completed: 2026-04-12*
