---
phase: 6
slug: add-pop-out-button-for-standalone-chat-overlay
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-07
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (existing) |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `npm test -- --grep-invert @agent --grep "popout\|switch-native"` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --grep-invert @agent --grep "popout\|switch-native"`
- **After every plan wave:** Run `npm test -- --grep-invert @agent`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | POP-08 | — | N/A | Static | `npx tsc --noEmit` | N/A | ⬜ pending |
| 06-01-02 | 01 | 1 | POP-01 | — | N/A | E2E | `npx playwright test tests/test-popout-button.spec.ts -x` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | POP-02 | — | N/A | E2E | `npx playwright test tests/test-popout-button.spec.ts -x` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | POP-03 | — | N/A | E2E | `npx playwright test tests/test-popout-button.spec.ts -x` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | POP-04 | — | N/A | E2E | `npx playwright test tests/test-popout-button.spec.ts -x` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 1 | POP-05 | — | N/A | E2E | `npx playwright test tests/test-popout-button.spec.ts -x` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | POP-06 | — | N/A | E2E | `npx playwright test tests/test-switch-native.spec.ts -x` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 2 | POP-07 | — | N/A | E2E | `npx playwright test tests/test-switch-native.spec.ts -x` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 3 | D-15 | — | N/A | Static | `npx tsc --noEmit` | N/A | ⬜ pending |
| 06-04-02 | 04 | 3 | D-15 | — | N/A | E2E | `npx tsc --noEmit && npm test -- --grep-invert @agent` | N/A | ⬜ pending |
| 06-05-01 | 05 | 3 | D-11,D-16 | — | Extension-origin URLs only | E2E | `npx tsc --noEmit` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test-popout-button.spec.ts` — stubs for POP-01 through POP-05
- [ ] `tests/test-switch-native.spec.ts` — stubs for POP-06, POP-07
- [ ] No framework changes needed — Playwright already installed and configured

*Existing infrastructure covers all framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pop-out window opens on correct monitor | POP-05 | Multi-monitor clamping requires physical hardware | Open pop-out, move to second monitor, close, reopen — verify position is restored |
| Kick native pop-out injection | POP-06/07 (Kick) | Kick pop-out URL unverified | Navigate to Kick live stream, pop out native chat, verify "Switch to AllChat" button |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
