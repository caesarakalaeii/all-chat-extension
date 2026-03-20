---
phase: 04-llm-test-infrastructure
plan: 01
subsystem: testing
tags: [playwright, websocket, ws, mock-server, global-setup, global-teardown]

# Dependency graph
requires:
  - phase: 03-kick-platform
    provides: "Completed extension with Twitch/YouTube/Kick support to test against"
provides:
  - "Node.js ws WebSocket server (tests/fixtures/mock-ws-server.ts) with startMockWsServer/stopMockWsServer/getMockWsServer exports"
  - "Playwright globalSetup/globalTeardown lifecycle wiring for mock WS server"
  - "npm test (fast suite) and npm run test:agent scripts"
affects: [04-02, 04-03, 04-04]

# Tech tracking
tech-stack:
  added: [ws@8.x, @types/ws]
  patterns: [playwright-global-lifecycle, mock-ws-server]

key-files:
  created:
    - tests/fixtures/mock-ws-server.ts
    - tests/fixtures/global-setup.ts
    - tests/fixtures/global-teardown.ts
  modified:
    - playwright.config.ts
    - package.json

key-decisions:
  - "Mock WS server uses Node.js ws library (not page.routeWebSocket) — service worker WebSockets are not interceptable via page context"
  - "globalSetup/globalTeardown via require.resolve() — Playwright resolves paths relative to config file"
  - "test script uses --grep-invert @agent to exclude agent tests from fast suite; test:agent uses --grep @agent"

patterns-established:
  - "Mock WS server pattern: module-level wss variable with start/stop/get exports for lifecycle control"
  - "Global lifecycle: globalSetup starts infrastructure, globalTeardown stops it — all tests share one server instance"

requirements-completed: [TEST-01, TEST-02, TEST-04]

# Metrics
duration: 7min
completed: 2026-03-12
---

# Phase 4 Plan 01: LLM Test Infrastructure — Mock WS Server and Test Scripts Summary

**Node.js ws mock WebSocket server on port 8080 with Playwright globalSetup/globalTeardown lifecycle and npm test/test:agent scripts**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-12T18:31:00Z
- **Completed:** 2026-03-12T18:38:32Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed ws and @types/ws dev dependencies
- Created mock WebSocket server that sends `connected` on connection and responds `pong` to `ping`, listening on port 8080
- Wired globalSetup/globalTeardown into playwright.config.ts so the server starts/stops around the entire test suite
- Added `npm test` (fast suite, excludes @agent) and `npm run test:agent` scripts to package.json

## Task Commits

Each task was committed atomically:

1. **Task 1: Install ws dependency and create mock WebSocket server** - `1aaf465` (feat)
2. **Task 2: Wire globalSetup/globalTeardown and add npm test scripts** - `2ba845b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `tests/fixtures/mock-ws-server.ts` - Mock WS server with startMockWsServer, stopMockWsServer, getMockWsServer exports
- `tests/fixtures/global-setup.ts` - Playwright globalSetup that starts mock WS server on port 8080
- `tests/fixtures/global-teardown.ts` - Playwright globalTeardown that stops mock WS server
- `playwright.config.ts` - Added globalSetup and globalTeardown fields referencing fixtures
- `package.json` - Added test and test:agent npm scripts; ws/types/ws added to devDependencies

## Decisions Made
- Used Node.js ws library instead of page.routeWebSocket() — service worker WebSockets run outside the page context and cannot be intercepted via Playwright's page-level routing
- globalSetup/globalTeardown paths use require.resolve() — Playwright resolves these paths relative to the config file location, require.resolve() ensures correct absolute path resolution
- test script inverts @agent grep to form the fast suite; test:agent selects only @agent-tagged tests — clean separation without duplicating test file lists

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

All created files found on disk. Both task commits verified in git log.

## Next Phase Readiness
- Mock WS server foundation is ready for Phase 4 Plan 02 (fast suite integration tests)
- All subsequent tests that need a WebSocket server can call startMockWsServer/stopMockWsServer or rely on the global lifecycle
- No blockers

---
*Phase: 04-llm-test-infrastructure*
*Completed: 2026-03-12*
