---
phase: 5
slug: per-site-enable-disable
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright + jest (existing) |
| **Config file** | `playwright.config.ts` / `jest.config.js` |
| **Quick run command** | `npx playwright test --grep @phase5` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test --grep @phase5`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | D-01,D-02,D-06 | unit | `npx playwright test --grep @phase5` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | D-02 | unit | `npx playwright test --grep storage-migration` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | D-04 | integration | `npx playwright test --grep state-changed` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 2 | D-03,D-05 | e2e | `npx playwright test --grep popup-toggles` | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 2 | D-07,D-08 | e2e | `npx playwright test --grep grayscale-icon` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/phase5/` — test directory structure
- [ ] Skip-stubs for all D-01 through D-08 decisions
- [ ] Fixture HTML for popup with per-platform toggles

*Existing Playwright infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grayscale icon visible in toolbar | D-07 | Chrome toolbar icon requires visual inspection | Load extension, disable a platform, verify toolbar icon is grayscale |
| Cross-device sync | D-01 | Requires two Chrome profiles with sync | Enable/disable platforms on one device, verify sync on another |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
