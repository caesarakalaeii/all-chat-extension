---
phase: 01-dom-slot-injection
plan: "01"
subsystem: testing
tags: [playwright, typescript, content-scripts, dom, fixtures]

# Dependency graph
requires: []
provides:
  - "PlatformDetector.waitForElement() — Promise-based DOM polling utility (preDelay + interval)"
  - "PlatformDetector.teardown() — shared cleanup removing allchat-container and allchat-hide-native-style"
  - "PlatformDetector.createInjectionPoint() async abstract signature"
  - "tests/fixtures/twitch-mock.html with .chat-shell slot"
  - "tests/fixtures/youtube-mock.html with ytd-live-chat-frame as direct flex child"
  - "tests/test-slot-injection.spec.ts — 4 skipped Playwright stubs (INJ-01, INJ-02, INJ-04, INJ-06)"
  - "tests/test-spa-navigation.spec.ts — 2 skipped Playwright stubs (INJ-05)"
affects:
  - 01-02 (Twitch plan — calls this.waitForElement('.chat-shell'))
  - 01-03 (YouTube plan — calls this.waitForElement and this.teardown)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise-based polling utility (preDelayMs + pollIntervalMs + timeoutMs) for async DOM element waiting"
    - "Overrideable teardown() pattern — base handles container/style removal, subclasses call super.teardown()"
    - "Skipped Playwright spec stubs as Wave 0 scaffolding — un-skipped as Wave 2 implements each requirement"

key-files:
  created:
    - tests/test-slot-injection.spec.ts
    - tests/test-spa-navigation.spec.ts
  modified:
    - src/content-scripts/base/PlatformDetector.ts
    - tests/fixtures/twitch-mock.html
    - tests/fixtures/youtube-mock.html

key-decisions:
  - "waitForElement uses preDelayMs before first poll (200ms default) to allow SPA initial render before DOM query"
  - "teardown() is non-abstract and overrideable — subclasses can call super.teardown() and add extra cleanup"
  - "createInjectionPoint() abstract signature changed to async — Wave 2 plans update concrete implementations"

patterns-established:
  - "polling-with-predelay: wait preDelayMs, then check once, then poll every pollIntervalMs until timeoutMs"
  - "overrideable-teardown: base class handles shared DOM cleanup, subclass adds platform-specific cleanup via super.teardown()"

requirements-completed:
  - INJ-07
  - INJ-08

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 1 Plan 01: PlatformDetector Infrastructure Summary

**Promise-based DOM polling utility (waitForElement), shared teardown, and async createInjectionPoint signature unblocking parallel Wave 2 Twitch/YouTube execution**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-12T13:53:42Z
- **Completed:** 2026-03-12T13:56:51Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `protected waitForElement()` with pre-delay polling strategy to `PlatformDetector` — Wave 2 plans call `await this.waitForElement('.chat-shell')` and `await this.waitForElement('ytd-live-chat-frame')`
- Added overrideable `teardown()` to `PlatformDetector` — removes `#allchat-container` and `#allchat-hide-native-style`, restores native chat visibility
- Updated `createInjectionPoint()` abstract signature to `Promise<HTMLElement | null>` and `init()` call site to `await this.createInjectionPoint()`
- Updated fixture HTML files to match actual DOM slot targets used by Twitch and YouTube injection code
- Created 6 skipped Playwright spec stubs covering INJ-01, INJ-02, INJ-04, INJ-05, INJ-06 ready for Wave 2 un-skip

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade PlatformDetector — waitForElement, teardown, async signature** - `2a0b1cf` (feat)
2. **Task 2: Wave 0 test scaffolding — fixtures and spec stubs** - `40e7435` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/content-scripts/base/PlatformDetector.ts` - Added waitForElement(), teardown(), updated createInjectionPoint() to async and await call site
- `tests/fixtures/twitch-mock.html` - Added `.chat-shell` inside `.right-column`
- `tests/fixtures/youtube-mock.html` - Replaced `#chat` wrapper with `#chat-container` flex parent, `ytd-live-chat-frame` as direct child
- `tests/test-slot-injection.spec.ts` - 4 skipped stubs: INJ-01, INJ-02, INJ-04, INJ-06
- `tests/test-spa-navigation.spec.ts` - 2 skipped stubs: INJ-05

## Decisions Made

- `waitForElement` uses a `preDelayMs` (200ms default) before the first poll to accommodate SPA render time before querying the DOM
- `teardown()` is non-abstract and overrideable so subclasses can add platform-specific cleanup (e.g., Twitch scoped observer disconnect) via `super.teardown()`
- `createInjectionPoint()` abstract signature changed to `Promise<HTMLElement | null>` — tsc errors in twitch.ts and youtube.ts are expected at this wave and will be resolved in Wave 2

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npx tsc` resolved to a non-project binary — used `node_modules/.bin/tsc` directly after installing dependencies. No impact on plan execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 2 plans (01-02 Twitch, 01-03 YouTube) can now call `await this.waitForElement()` and `this.teardown()` without TypeScript errors
- Fixture HTML files are aligned with the DOM selectors the injection code will query
- Test stubs are in place for un-skipping as each INJ requirement is implemented in Wave 2

## Self-Check: PASSED

All created files confirmed present on disk. Both task commits (2a0b1cf, 40e7435) confirmed in git log.

---
*Phase: 01-dom-slot-injection*
*Completed: 2026-03-12*
