---
phase: 04-llm-test-infrastructure
plan: 02
subsystem: testing
tags: [playwright, chrome-extension, page.route, launchPersistentContext, context.route, fixture-html]

# Dependency graph
requires:
  - phase: 04-llm-test-infrastructure
    provides: mock WS server, global setup/teardown, npm test scripts from plan 04-01

provides:
  - 33 passing Playwright tests covering INJ-01/02/04/05/06, KICK-01/02/06/07, DS-01/02/03/08/09/10a/10b, KICK-05
  - page-fixture test pattern using launchPersistentContext + context.route() for extension injection
  - Static fs test pattern (no browser needed) for source code assertions
  - Documented live-network guard pattern for test-streamer-switch.spec.ts

affects:
  - 04-llm-test-infrastructure (CI job now has passing test suite to run)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - chromium.launchPersistentContext for Chrome extension testing (page fixture does not load extensions)
    - context.route() for intercepting extension service worker fetch requests (page.route() only intercepts page context)
    - waitUntil domcontentloaded for page.goto in extension tests (prevents load timeout)
    - test.beforeAll/afterAll with shared BrowserContext per describe block

key-files:
  created: []
  modified:
    - tests/test-design-system.spec.ts
    - tests/test-kick-detection.spec.ts
    - tests/test-kick-injection.spec.ts
    - tests/test-kick-selector-fallback.spec.ts
    - tests/test-kick-spa-navigation.spec.ts
    - tests/test-slot-injection.spec.ts
    - tests/test-spa-navigation.spec.ts
    - tests/test-postmessage-origin.spec.ts
    - tests/test-streamer-switch.spec.ts
    - tests/fixtures/twitch-mock.html
    - tests/fixtures/youtube-mock.html

key-decisions:
  - "chromium.launchPersistentContext() required for Chrome extensions in Playwright — page fixture does not load extensions"
  - "context.route() intercepts service worker fetches; page.route() only intercepts page-context requests"
  - "window.location.pathname assignment in fixture HTML causes infinite navigation loop — removed from twitch-mock.html and youtube-mock.html"
  - "YouTube content script requires ytd-channel-name anchor in fixture HTML for username extraction"
  - "INJ-05 test must change URL via history.pushState before dispatching yt-navigate-finish (extension deduplicates by URL)"
  - "KICK-07c requires 35s timeout — fallback chain traverses 2x 10s waits (#channel-chatroom + #chatroom)"
  - "test-streamer-switch.spec.ts conditional test.skip() calls are intentional live-network guards — annotated with justifying comments"

patterns-established:
  - "Extension testing pattern: chromium.launchPersistentContext + context.route() for service worker interception"
  - "Static fs test pattern: synchronous test body with fs.readFileSync for source code assertions (no browser)"
  - "page.route() still used for platform HTML (page context request), context.route() for allch.at API (service worker request)"

requirements-completed:
  - TEST-06

# Metrics
duration: 90min
completed: 2026-03-13
---

# Phase 4 Plan 02: Implement Skipped Tests Summary

**Playwright extension test suite: 33 tests passing using launchPersistentContext + context.route() for service worker interception**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-03-13T18:00:00Z
- **Completed:** 2026-03-13T19:30:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- All static fs tests (DS-01/02/03/08/09/10a/10b, KICK-01a/01b/01c/07a, KICK-05a/05b/05c/05d) unskipped and passing
- All page-fixture tests implemented: INJ-01/02/04/06 (Twitch/YouTube injection), KICK-02a/02b/02c (Kick injection), KICK-06a/06b/06c (Kick SPA navigation), KICK-07b/07c (selector fallback), INJ-05 (YouTube SPA), KICK-01d (non-live page), KICK-05e (postMessage origin guard)
- `npm test` runs 33 tests, 5 skipped (runtime guards for DS-04/05/06/07/10 requiring full page fixture setup)
- test-streamer-switch.spec.ts conditional skips annotated with justifying comments

## Task Commits

1. **Task 1: Unskip static fs tests** - `dbdb009` (feat)
2. **Task 2: Implement page-fixture tests (initial)** - `f5b328f` (feat)
3. **Task 2: Fix extension testing with launchPersistentContext** - `1c3e96c` (fix)

## Files Created/Modified
- `tests/test-design-system.spec.ts` - Removed test.skip() wrappers from DS-01/02/03/08/09/10a/10b
- `tests/test-kick-detection.spec.ts` - Unskipped KICK-01a/b/c; implemented KICK-01d with launchPersistentContext
- `tests/test-kick-injection.spec.ts` - Implemented KICK-02a/b/c with launchPersistentContext + context.route()
- `tests/test-kick-selector-fallback.spec.ts` - Unskipped KICK-07a; implemented KICK-07b/c with fallback chain tests
- `tests/test-kick-spa-navigation.spec.ts` - Implemented KICK-06a/b/c SPA navigation tests
- `tests/test-slot-injection.spec.ts` - Implemented INJ-01/02/04/06 with launchPersistentContext
- `tests/test-spa-navigation.spec.ts` - Implemented INJ-05 YouTube SPA teardown/re-init tests
- `tests/test-postmessage-origin.spec.ts` - Implemented KICK-05e postMessage origin rejection test
- `tests/test-streamer-switch.spec.ts` - Annotated conditional test.skip() calls with justifying comments
- `tests/fixtures/twitch-mock.html` - Removed window.location.pathname assignment (caused infinite redirect)
- `tests/fixtures/youtube-mock.html` - Removed window.location.pathname; added ytd-channel-name anchor for username extraction

## Decisions Made
- `chromium.launchPersistentContext()` is required for Chrome extensions in Playwright. The `page` fixture from project config does not actually load extensions for content script injection — only `launchPersistentContext` with explicit `--load-extension` args works.
- `context.route()` must be used (not `page.route()`) for the allch.at API mock because the extension's service worker makes fetch requests from a separate context. `page.route()` only intercepts requests from the page renderer context.
- The fixture HTML files had `window.location.pathname = '/...'` assignments that caused infinite reload loops when served via `page.route()` (navigating to the same pathname triggers a reload). Removed.
- The YouTube content script waits for `ytd-channel-name a` via `waitForElement()` before calling `init()`. This element must exist in the fixture.
- KICK-07c requires 35s test timeout (2x 10s selector timeouts in the fallback chain).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] window.location.pathname in fixture HTML causes infinite navigation loops**
- **Found during:** Task 2 (page-fixture test implementation)
- **Issue:** twitch-mock.html and youtube-mock.html had `window.location.pathname = '/teststreamer'` which triggered a page reload when served via page.route(), creating an infinite loop
- **Fix:** Removed the script blocks from both fixture files — the URL is already correct from page.goto()
- **Files modified:** tests/fixtures/twitch-mock.html, tests/fixtures/youtube-mock.html
- **Verification:** `npm test` no longer hangs on goto()
- **Committed in:** 1c3e96c

**2. [Rule 1 - Bug] page fixture does not load Chrome extensions; must use launchPersistentContext**
- **Found during:** Task 2 (debugging why extension content scripts weren't running)
- **Issue:** The chromium-extension project's `page` fixture does not cause content scripts to actually inject into pages — only `chromium.launchPersistentContext()` with explicit `--load-extension` args enables extension behavior
- **Fix:** Rewrote all page-fixture tests to use `launchPersistentContext` with `beforeAll/afterAll` context management
- **Files modified:** All 7 page-fixture spec files
- **Verification:** Extension console logs appear, containers inject correctly
- **Committed in:** 1c3e96c

**3. [Rule 1 - Bug] page.route() cannot intercept service worker fetch requests**
- **Found during:** Task 2 (debugging why allch.at mock wasn't working)
- **Issue:** `page.route('https://allch.at/**')` only intercepts page-context requests. The extension service worker's fetch to allch.at API bypasses page routes
- **Fix:** Use `context.route()` (from launchPersistentContext context) which intercepts all requests including service worker fetches
- **Files modified:** All page-fixture spec files (changed page.route to context.route for allch.at)
- **Verification:** `ALLCHAT CONTEXT ROUTE HIT` log appears, extension proceeds past streamer check
- **Committed in:** 1c3e96c

**4. [Rule 1 - Bug] youtube-mock.html missing ytd-channel-name anchor required for username extraction**
- **Found during:** Task 2 (debugging YouTube injection failure)
- **Issue:** YouTube content script waits for `ytd-channel-name a` to appear (10s timeout), then extracts username from it. The fixture HTML had no such element, so username extraction returned null
- **Fix:** Added `<ytd-channel-name><a href="/@teststreamer">teststreamer</a></ytd-channel-name>` to fixture
- **Files modified:** tests/fixtures/youtube-mock.html
- **Verification:** YouTube injection tests pass
- **Committed in:** 1c3e96c

**5. [Rule 1 - Bug] INJ-05 test dispatched yt-navigate-finish without URL change (dedup prevented teardown)**
- **Found during:** Task 2 (INJ-05 test failing)
- **Issue:** YouTube content script deduplicates navigation events by URL equality. Dispatching `yt-navigate-finish` without changing the URL caused the handler to return early (url === activeUrl)
- **Fix:** Added `history.pushState({}, '', '/watch?v=other-video')` before dispatching the event
- **Files modified:** tests/test-spa-navigation.spec.ts
- **Verification:** INJ-05 teardown test now passes
- **Committed in:** 1c3e96c

---

**Total deviations:** 5 auto-fixed (all Rule 1 - Bug)
**Impact on plan:** All auto-fixes necessary for correctness. The plan's routing approach was based on incorrect assumption that page.route() works for service workers and that page fixture loads extensions. Fixes required but stayed within plan scope.

## Issues Encountered
- The planned `page.route()` approach for the allch.at API mock doesn't work because the built production extension uses `https://allch.at` (not `localhost:8080`) as the API URL, and service worker fetches are not interceptable by page-level routes. Solution: `context.route()` intercepts at the browser context level, which covers service worker requests.
- The Playwright `chromium-extension` project fixture appears to load the extension but content scripts don't run — possibly because Playwright's browser initialization doesn't go through the Chrome extension activation flow the same way `launchPersistentContext` does.

## Next Phase Readiness
- `npm test` runs 33 meaningful tests with zero hangs or crashes
- Static fs tests (DS/KICK source code assertions) run in <1s
- Page-fixture tests use launchPersistentContext with proper extension loading
- 5 remaining skipped tests (DS-04/05/06/07/10) require additional fixture infrastructure for iframe content assertions — deferred to future work
- Phase 4 fast test suite is complete and ready for CI integration (covered in plan 04-03)

## Self-Check: PASSED

---
*Phase: 04-llm-test-infrastructure*
*Completed: 2026-03-13*
