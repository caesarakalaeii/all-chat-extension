---
phase: 4
slug: llm-test-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.57.0 |
| **Config file** | `playwright.config.ts` (exists) |
| **Quick run command** | `npx playwright test --grep-invert @agent` |
| **Full suite command** | `npx playwright test --grep-invert @agent` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test --grep-invert @agent`
- **After every plan wave:** Run `npx playwright test --grep-invert @agent`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | TEST-01 | integration | `npx playwright test --grep-invert @agent` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 0 | TEST-04 | smoke | `npm test` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 0 | TEST-02 | smoke | `npx playwright test --grep-invert @agent` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | TEST-06 | unit | `npx playwright test --grep-invert @agent` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | TEST-06 | unit | `npx playwright test --grep-invert @agent` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | TEST-05 | manual-only | Claude MCP session | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixtures/mock-ws-server.ts` — stubs for TEST-01
- [ ] `tests/fixtures/global-setup.ts` — globalSetup that starts mock WS server
- [ ] `tests/fixtures/global-teardown.ts` — globalTeardown that stops mock WS server
- [ ] `tests/agent/twitch-scenario.md` — scenario file for TEST-04, TEST-05
- [ ] `tests/agent/youtube-scenario.md` — scenario file for TEST-05
- [ ] `tests/agent/kick-scenario.md` — scenario file for TEST-05
- [ ] `package.json` `test` and `test:agent` scripts — TEST-04
- [ ] `playwright.config.ts` `globalSetup`/`globalTeardown` entries — TEST-01
- [ ] `npm install --save-dev ws @types/ws` — required for mock WS server

*Existing fixture HTML files (twitch-mock.html, youtube-mock.html, kick-mock.html) are in place and kept as-is.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| At least one agent scenario per platform passes (chat visible, badge correct, send flow) | TEST-05 | Agent tests are Claude MCP sessions, not spec files — no automated CI runner | Open Playwright MCP browser with extension loaded; run twitch-scenario.md, youtube-scenario.md, kick-scenario.md step-by-step |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
