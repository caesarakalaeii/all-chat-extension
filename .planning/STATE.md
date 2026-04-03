---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 05-04-PLAN.md
last_updated: "2026-04-03T14:01:03.004Z"
last_activity: 2026-04-03
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 20
  completed_plans: 20
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** The chat replacement must be visually seamless and feel native — users should not perceive any difference from the platform's own chat, except that it looks better and supports all platforms at once.
**Current focus:** Phase 05 — per-site-enable-disable

## Current Position

Phase: 05 (per-site-enable-disable) — EXECUTING
Plan: 5 of 5
Status: Ready to execute
Last activity: 2026-04-03

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*
| Phase 01-dom-slot-injection P01 | 3 | 2 tasks | 5 files |
| Phase 01-dom-slot-injection P02 | 5min | 1 tasks | 2 files |
| Phase 01-dom-slot-injection P03 | 1 | 1 tasks | 1 files |
| Phase 02-design-system P01 | 5min | 1 tasks | 1 files |
| Phase 02-design-system P02 | 2min | 2 tasks | 4 files |
| Phase 02-design-system P03 | 5min | 2 tasks | 2 files |
| Phase 02-design-system P04 | 4min | 2 tasks | 5 files |
| Phase 02-design-system P05 | 5min | 2 tasks | 3 files |
| Phase 03-kick-platform P01 | 2min | 2 tasks | 6 files |
| Phase 03-kick-platform P02 | 4min | 2 tasks | 5 files |
| Phase 03-kick-platform P03 | 15min | 2 tasks | 1 files |
| Phase 03-kick-platform P04 | 5min | 2 tasks | 2 files |
| Phase 04-llm-test-infrastructure P01 | 7min | 2 tasks | 5 files |
| Phase 04-llm-test-infrastructure P03 | 3min | 2 tasks | 4 files |
| Phase 04-llm-test-infrastructure P02 | 90min | 2 tasks | 11 files |
| Phase 05-per-site-enable-disable P00 | 5min | 1 tasks | 2 files |
| Phase 05-per-site-enable-disable P01 | 4min | 2 tasks | 9 files |
| Phase 05-per-site-enable-disable P02 | 10min | 2 tasks | 4 files |
| Phase 05-per-site-enable-disable P04 | 5min | 3 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Keep iframe for CSS isolation — shadow DOM is an alternative but iframe is simpler and proven
- [Roadmap]: Mount iframe in native DOM slot — eliminates z-index/overlay class of bugs; prerequisite for resizable panel
- [Roadmap]: Recreate design system components without @base-ui — too heavy for extension content bundle
- [Roadmap]: Playwright + LLM agent for testing — brittle selector tests break on platform DOM changes
- [Phase 01-dom-slot-injection]: waitForElement uses preDelayMs before first poll to accommodate SPA render time
- [Phase 01-dom-slot-injection]: teardown() is non-abstract and overrideable — subclasses extend via super.teardown()
- [Phase 01-dom-slot-injection]: createInjectionPoint() async signature — tsc errors in twitch.ts/youtube.ts expected and resolved in Wave 2
- [Phase 01-dom-slot-injection]: UI_COLLAPSED handler removed — .chat-shell controls dimensions in slot injection mode
- [Phase 01-dom-slot-injection]: slotObserver kept as module-level let for teardown() override access
- [Phase 01-dom-slot-injection]: insertBefore(container, nativeChat) places #allchat-container before ytd-live-chat-frame in flex parent — correct slot position
- [Phase 01-dom-slot-injection]: Style tag hide in <head> chosen over inline style — Polymer re-creation restores inline styles; style tag persists
- [Phase 01-dom-slot-injection]: yt-navigate-finish is canonical YouTube SPA signal — replaces MutationObserver polling (fires thousands of times per navigation)
- [Phase 02-design-system]: Static test.skip for sync fs tests; runtime test.skip() for Playwright fixture tests preserves async signature
- [Phase 02-design-system]: MiniCssExtractPlugin replaces style-loader — CSS extracted to dist/ui/chat-styles.css for link tag injection in iframe
- [Phase 02-design-system]: tailwind.config.js deleted — Tailwind 4 uses CSS-first @import 'tailwindcss' approach
- [Phase 02-design-system]: autoprefixer removed — Tailwind 4 handles vendor prefixes natively (DS-08)
- [Phase 02-design-system]: Verbatim @theme block copied from all-chat/frontend/src/app/globals.css — single source of truth for all token values
- [Phase 02-design-system]: Inline style block removed from chat-container.html — superseded by Tailwind 4 token system via chat-styles.css link tag
- [Phase 02-design-system]: InfinityLogo header layout locked: collapse button left, InfinityLogo 24px center, connection dot + platform badge right — no text labels
- [Phase 02-design-system]: outline-none -> outline-hidden, shadow-sm -> shadow-xs for Tailwind 4 rename compliance in UI components
- [Phase 02-design-system]: ErrorBoundary written as inline fallback card — ErrorDisplay.tsx not reused (requires ChatError typed props)
- [Phase 02-design-system]: Retry button calls setState({ hasError: false }) — no window.location.reload
- [Phase 03-kick-platform]: kick-mock.html nests #channel-chatroom > #chatroom > .chatroom-wrapper so all three fallback selectors coexist in one fixture
- [Phase 03-kick-platform]: Static test.skip for KICK-07a fs test; runtime test.skip() for page-fixture tests (KICK-07b/07c)
- [Phase 03-kick-platform]: extensionOrigin derived at call site (not module-level) — getURL synchronous, avoids top-level init ordering issues
- [Phase 03-kick-platform]: iframe origin guard placed as first two lines inside message listener — fires before any event.data access
- [Phase 03-kick-platform]: API-based live detection for Kick — no stable DOM live badge; fetch kick.com/api/v2/channels/{slug}, check data.livestream !== null
- [Phase 03-kick-platform]: hideNativeChat targets #channel-chatroom children not the slot itself — preserves injected #allchat-container
- [Phase 03-kick-platform]: Kick manifest entries use https://kick.com/* (no www subdomain) — consistent across host_permissions, content_scripts.matches, and web_accessible_resources.matches
- [Phase 04-llm-test-infrastructure]: Mock WS server uses Node.js ws library (not page.routeWebSocket) — service worker WebSockets are not interceptable via page context
- [Phase 04-llm-test-infrastructure]: test script uses --grep-invert @agent for fast suite; test:agent uses --grep @agent — clean separation without duplicating test file lists
- [Phase 04-llm-test-infrastructure]: TEST-03 and TEST-07 dropped: agent tests are manual Claude MCP sessions only; no ANTHROPIC_API_KEY secret in CI
- [Phase 04-llm-test-infrastructure]: test CI job builds own artifact with API_URL=http://localhost:8080 for mock WS server connectivity
- [Phase 04-llm-test-infrastructure]: xvfb-run -a npm test used in CI: Chrome extension tests require display context on ubuntu-latest
- [Phase 04-llm-test-infrastructure]: chromium.launchPersistentContext() required for Chrome extensions in Playwright — page fixture does not load extensions
- [Phase 04-llm-test-infrastructure]: context.route() intercepts service worker fetches; page.route() only intercepts page-context requests — use context.route() for allch.at API mock
- [Phase 04-llm-test-infrastructure]: window.location.pathname assignment in fixture HTML causes infinite navigation loops — must not assign location properties in fixture scripts served via page.route()
- [Phase 05-per-site-enable-disable]: test.skip() at individual test level so each stub shows as distinct skipped test in reporter
- [Phase 05-per-site-enable-disable]: Tests placed in tests/ root (not tests/phase5/) to match existing project convention
- [Phase 05-per-site-enable-disable]: Read-time migration in getSyncStorage: legacy extensionEnabled maps to all three platformEnabled values with fire-and-forget persistence
- [Phase 05-per-site-enable-disable]: Pre-generated grayscale PNG icon assets chosen over OffscreenCanvas for disabled-platform icon state (D-07, D-08)
- [Phase 05-per-site-enable-disable]: Popup handleToggle bridges to all-three platformEnabled toggle until per-platform UI redesign in plan 05-03
- [Phase 05-per-site-enable-disable]: setupGlobalMessageRelay() called before early return when disabled — ensures re-enable messages are received even when extension starts disabled for that platform
- [Phase 05-per-site-enable-disable]: messageRelaySetup boolean guard prevents duplicate chrome.runtime.onMessage listeners when re-enable path calls setupGlobalMessageRelay() again
- [Phase 05-per-site-enable-disable]: E2E tests use nested test.describe to separate browser context lifecycle from fs-based tests — avoids launching extension for type-level checks
- [Phase 05-per-site-enable-disable]: Storage migration E2E tests simulate migration logic inline via sw.evaluate rather than calling getSyncStorage directly — avoids ES module import issues in extension context

### Roadmap Evolution

- Phase 5 added: Per-site enable/disable — let users choose which sites have AllChat enabled instead of global on/off

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1 - RESOLVED]: YouTube `yt-navigate-finish` event verified in live browser (2026-03-12) — works correctly, plan 01-03 approved
- [Phase 3]: Kick DOM selectors (`#channel-chatroom`, `#chatroom`, `.chatroom-wrapper`) must be verified against live kick.com before Phase 3 begins
- [Phase 4]: `ANTHROPIC_API_KEY` CI secret must be provisioned before agent tests can run — confirm availability during Phase 4 planning

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260327-kbw | Implement issue #20: Replace Message sent toast with inline input feedback | 2026-03-27 | 2127d27 | [260327-kbw-implement-issue-20-replace-message-sent-](./quick/260327-kbw-implement-issue-20-replace-message-sent-/) |

## Session Continuity

Last session: 2026-04-03T14:01:03.002Z
Stopped at: Completed 05-04-PLAN.md
Resume file: None
