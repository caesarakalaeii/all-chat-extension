---
phase: 01-dom-slot-injection
plan: "03"
subsystem: content-scripts
tags: [youtube, typescript, dom, slot-injection, spa-navigation, css]

# Dependency graph
requires:
  - phase: 01-dom-slot-injection
    plan: "01"
    provides: "PlatformDetector.waitForElement(), teardown(), async createInjectionPoint() signature"
provides:
  - "YouTubeDetector.createInjectionPoint() async — waitForElement('ytd-live-chat-frame') + insertBefore slot injection"
  - "YouTubeDetector.hideNativeChat() — <style id='allchat-hide-native-style'> CSS tag (survives Polymer re-renders)"
  - "YouTubeDetector.showNativeChat() — removes style tag"
  - "setupUrlWatcher() — yt-navigate-finish + popstate event-based SPA navigation (no MutationObserver)"
  - "YOUTUBE_INIT_DELAY removed — timing delegated to waitForElement()"
affects:
  - 02 (Playwright test un-skip — INJ-04, INJ-05, INJ-06 stubs ready)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS-tag hide: inject <style> tag into document.head to hide native chat — survives Polymer element re-creation"
    - "SPA navigation via yt-navigate-finish + popstate — canonical YouTube events, not MutationObserver polling"
    - "URL deduplication: if (url === activeUrl) return — prevents double-init when both events fire for same navigation"
    - "Async slot injection: await waitForElement then insertBefore to place container before native chat in flex flow"

key-files:
  created: []
  modified:
    - src/content-scripts/youtube.ts

key-decisions:
  - "insertBefore(container, nativeChat) instead of appendChild — places #allchat-container before ytd-live-chat-frame in flex parent (correct slot position)"
  - "Style tag hide chosen over inline style — ytd-live-chat-frame is a Polymer component that restores inline styles on re-creation; style tag in <head> persists"
  - "yt-navigate-finish is the canonical YouTube SPA signal — fires once per navigation, unlike MutationObserver which fires thousands of times"
  - "Navigation listeners registered once in initialize() — not re-registered per navigation to avoid listener accumulation"

patterns-established:
  - "css-tag-hide: document.head.appendChild(style) with id guard — idempotent, Polymer-safe"
  - "spa-event-dedup: track activeUrl, early-return if url === activeUrl — handles yt-navigate-finish + popstate co-firing"

requirements-completed:
  - INJ-04
  - INJ-05
  - INJ-06
  - INJ-08

# Metrics
duration: 1min
completed: 2026-03-12
---

# Phase 1 Plan 03: YouTube Slot Injection Summary

**YouTube chat replaced via insertBefore slot injection, persistent CSS-tag hide (Polymer-safe), and yt-navigate-finish SPA navigation — removing MutationObserver polling and 2-second init delay**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-12T14:04:08Z
- **Completed:** 2026-03-12T14:05:28Z
- **Tasks:** 2 of 2 (checkpoint:human-verify approved 2026-03-12)
- **Files modified:** 1

## Accomplishments

- Rewrote `createInjectionPoint()` as async using `waitForElement('ytd-live-chat-frame')` and `insertBefore` — `#allchat-container` now mounts before `ytd-live-chat-frame` in the same flex parent
- Replaced inline `element.style.display = 'none'` with `<style id="allchat-hide-native-style">` CSS tag — survives Polymer re-creation of `ytd-live-chat-frame` on SPA navigation
- Replaced MutationObserver URL polling with `yt-navigate-finish` + `popstate` event listeners — fires once per navigation, deduplicated via URL equality check
- Removed `YOUTUBE_INIT_DELAY` constant and both `setTimeout(init, 2000)` call sites — timing now delegated to `waitForElement()`

## Task Commits

1. **Task 1: Rewrite YouTubeDetector — slot injection, style-tag hide, event navigation** - `b63b9d7` (feat)
2. **Task 2 (checkpoint:human-verify): Browser verification** - Approved by user 2026-03-12

**Deviation fix:** `d3149b0` (fix) — wait for ytd-channel-name before init on direct page load

**Plan metadata:** `4ef612c` (docs: complete youtube slot injection plan)
**Post-checkpoint metadata:** `ccd6cf5` (docs: mark plan complete after browser verification approval)

## Files Created/Modified

- `src/content-scripts/youtube.ts` - Rewrote hideNativeChat, showNativeChat, createInjectionPoint (async), setupUrlWatcher, initialize — removed YOUTUBE_INIT_DELAY

## Decisions Made

- `insertBefore(container, nativeChat)` replaces `appendChild` — the plan specified this explicitly because YouTube's flex layout requires `#allchat-container` to appear *before* `ytd-live-chat-frame` in the DOM tree to get the correct visual slot position
- Style tag in `<head>` survives Polymer re-creation cycles; the old `element.style.display = 'none'` was erased whenever YouTube's Polymer renderer recreated the `ytd-live-chat-frame` element on navigation
- `yt-navigate-finish` is YouTube's own SPA navigation event — the old MutationObserver-on-document approach fired thousands of mutations per navigation causing unnecessary re-init attempts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wait for ytd-channel-name before init on direct page load**
- **Found during:** Task 2 (checkpoint:human-verify — browser testing)
- **Issue:** `extractStreamerUsername()` relies on `ytd-channel-name a` rendering, which is not ready when the content script fires on `/watch?v=` URLs directly. The race condition caused username extraction to fail.
- **Fix:** Added `await this.waitForElement('ytd-channel-name a')` before `init()` call in `initialize()` — timing delegated to the same `waitForElement` utility, no fixed delay introduced
- **Files modified:** `src/content-scripts/youtube.ts`
- **Verification:** Confirmed working in live browser — username extraction succeeds on direct page loads
- **Committed in:** `d3149b0` (fix: wait for channel name element before init on direct page load)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Auto-fix necessary for correctness on direct page loads. No scope creep — uses existing waitForElement() utility.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- YouTube injection code complete — human verification approved 2026-03-12
- Playwright test stubs for INJ-04, INJ-05, INJ-06 can be un-skipped in `tests/test-slot-injection.spec.ts` and `tests/test-spa-navigation.spec.ts`
- `npx tsc --noEmit` passes with zero errors — both Twitch and YouTube now implement async `createInjectionPoint()`
- No `INIT_DELAY` constants remain anywhere in `src/` — INJ-08 complete across all platforms

## Self-Check: PASSED

- `src/content-scripts/youtube.ts` confirmed present on disk
- Commit `b63b9d7` confirmed in git log
- `npx tsc --noEmit` passes with zero errors
- All done criteria verified: no YOUTUBE_INIT_DELAY, no inline style hide, yt-navigate-finish present, insertBefore present, allchat-hide-native-style present

---
*Phase: 01-dom-slot-injection*
*Completed: 2026-03-12*
