---
phase: 04-llm-test-infrastructure
plan: 03
subsystem: testing
tags: [playwright, github-actions, ci, llm-agent, xvfb, mcp]

# Dependency graph
requires:
  - phase: 04-llm-test-infrastructure
    plan: 01
    provides: npm test script (--grep-invert @agent fast suite) and mock WS server
provides:
  - Claude MCP agent scenario scripts for Twitch, YouTube, and Kick (TEST-05)
  - CI test job in GitHub Actions running fast suite after every build
affects:
  - future LLM agent test sessions (scenario scripts)
  - CI pipeline (test job gates PRs before release)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Agent scenarios defined as markdown files with numbered steps for Claude MCP sessions
    - CI test job builds own artifact with API_URL=localhost rather than downloading build artifact
    - xvfb-run required for Chrome extension tests on headless ubuntu-latest

key-files:
  created:
    - tests/agent/twitch-scenario.md
    - tests/agent/youtube-scenario.md
    - tests/agent/kick-scenario.md
  modified:
    - .github/workflows/build-and-release.yml

key-decisions:
  - "TEST-03 (Stagehand LlmAgent) and TEST-07 (ANTHROPIC_API_KEY CI secret) are documented as dropped — no automated CI runner for agent tests; Claude is the agent via manual MCP sessions"
  - "test CI job builds its own artifact with API_URL=http://localhost:8080 (not downloaded from build job) — extension service worker connects to mock WS on port 8080"
  - "xvfb-run -a npm test used for CI because Chrome extension tests require a display context on ubuntu-latest"

patterns-established:
  - "Agent scenario files live in tests/agent/ as markdown, not as code — they are scripts for Claude to follow in MCP browser sessions"

requirements-completed:
  - TEST-05

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 4 Plan 03: LLM Agent Scenarios and CI Test Job Summary

**Three Claude MCP agent scenario scripts (Twitch, YouTube, Kick) plus GitHub Actions test job running fast Playwright suite with xvfb-run after every build**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-13T16:18:01Z
- **Completed:** 2026-03-13T16:21:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created three agent scenario markdown files (11-step MCP browser scripts) for Twitch, YouTube, and Kick — fulfilling TEST-05
- Added `test` CI job to GitHub Actions that runs `xvfb-run -a npm test` after every build with `API_URL=http://localhost:8080` for mock WS compatibility
- Documented TEST-03 and TEST-07 as dropped decisions (no Stagehand, no ANTHROPIC_API_KEY in CI) directly in scenario files and plan

## Task Commits

Each task was committed atomically:

1. **Task 1: Create agent scenario markdown files** - `0848416` (feat)
2. **Task 2: Add test CI job to GitHub Actions workflow** - `bf85c49` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `tests/agent/twitch-scenario.md` - 11-step Claude MCP scenario for Twitch: iframe in .chat-shell, platform badge, chat input
- `tests/agent/youtube-scenario.md` - 11-step Claude MCP scenario for YouTube: native chat hidden via style tag, iframe injection
- `tests/agent/kick-scenario.md` - 11-step Claude MCP scenario for Kick: iframe in #channel-chatroom, native chat hidden
- `.github/workflows/build-and-release.yml` - added `test` job between build and release with xvfb-run and localhost API_URL

## Decisions Made

- TEST-03 and TEST-07 explicitly dropped: agent tests are manual Claude MCP sessions only; no ANTHROPIC_API_KEY secret needed in CI
- Test CI job builds its own artifact with API_URL=http://localhost:8080 rather than downloading the production build artifact — required for mock WS server connectivity
- xvfb-run -a selected over headless mode because Chrome extension tests require a real display context on ubuntu-latest

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 plan 03 completes TEST-05 (LLM agent scenarios per platform)
- All three platform scenario scripts are ready for use in Claude MCP browser sessions
- CI fast suite now runs automatically on every push/PR to main
- Phase 4 LLM test infrastructure is complete with all three plans delivered

## Self-Check: PASSED

- tests/agent/twitch-scenario.md: FOUND
- tests/agent/youtube-scenario.md: FOUND
- tests/agent/kick-scenario.md: FOUND
- .planning/phases/04-llm-test-infrastructure/04-03-SUMMARY.md: FOUND
- Commit 0848416 (Task 1): FOUND
- Commit bf85c49 (Task 2): FOUND

---
*Phase: 04-llm-test-infrastructure*
*Completed: 2026-03-13*
