# Retrospective

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-14
**Phases:** 4 | **Plans:** 15 | **Tasks:** ~27

### What Was Built

- DOM slot injection on Twitch (`.chat-shell`) and YouTube (flex slot before `ytd-live-chat-frame`) — fixed-position overlay fully removed
- Tailwind 4 CSS pipeline with OkLCh design tokens, Inter/DM Mono fonts, InfinityLogo animated SVG in chat header
- Kick.com platform support: API-based live detection, 3-selector fallback chain, SPA navigation, manifest/webpack wiring
- postMessage hardening: URL-param iframe init replaces postMessage; extensionOrigin in relay calls
- 32-test Playwright suite using `launchPersistentContext` + `context.route()` for real extension testing
- GitHub Actions CI job running fast suite with xvfb-run after every build

### What Worked

- **Dependency-ordered phases** — building slot injection first meant the iframe was reliably injectable before tests tried to use it; no wasted test work
- **Wave 0 test scaffolding** — creating skip-stubs before implementation gave a clear checklist of what needed to pass; tests were never broken long-term
- **PlatformDetector base class pattern** — all three platforms reusing `waitForElement()`, `teardown()`, and `injectAllChatUI()` meant Kick implementation was just filling in the subclass, not re-solving solved problems
- **context.route() discovery** — realizing page.route() doesn't intercept service worker fetches was a key insight; documenting it in SUMMARY prevents future pain

### What Was Inefficient

- **KICK-05 / index.tsx architecture drift** — the postMessage → URL-param migration happened during Phase 3 but the Phase 4 KICK-05d and KICK-05a tests were written against the old design. Caught by audit but added remediation work. Cleaner: update tests within the same plan that changes the architecture.
- **YouTube relay stale selector** — `#allchat-iframe` was a pre-Phase-1 artifact that survived because tests didn't cover the relay path end-to-end. Caught by integration checker at audit time.
- **Phase 4 missing VERIFICATION.md** — verifier agent wasn't run for Phase 4, leaving test infrastructure unverified by the standard process. Not a blocker (phase was straightforward) but breaks the audit trail.

### Patterns Established

- `chromium.launchPersistentContext()` + `context.route()` is the correct pattern for Chrome extension Playwright tests — document this in any new test file
- URL-param init for iframe (`?platform=...&streamer=...`) is the established pattern; don't revert to postMessage
- Agent scenarios live in `tests/agent/` as markdown; Claude MCP is the test runner for agent tests
- Kick selectors need a `// verified YYYY-MM-DD` date-comment for maintenance awareness

### Key Lessons

- **Integration testing is not optional** — the YouTube relay bug and KICK-05d failure were both undetected by individual phase verifiers. An integration check across all phases is necessary before shipping.
- **Audit before tag** — running `/gsd:audit-milestone` surfaced 2 production bugs that would have shipped. Worth the 10 minutes.
- **Architecture decisions propagate** — when the init mechanism changed (postMessage → URL params), tests in later plans should have been updated atomically. Cross-cutting changes need a "what else references this?" check.

### Cost Observations

- Model mix: sonnet throughout (balanced profile)
- Sessions: ~6 sessions across 2 days
- Notable: Phase 4 plan 02 (90 min) was by far the longest — debugging Chrome extension Playwright patterns. All other plans were 2–7 min.

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Days | 2 |
| Phases | 4 |
| Plans | 15 |
| Tests passing | 32 |
| Bugs found at audit | 2 |
| Requirements dropped | 2 |
