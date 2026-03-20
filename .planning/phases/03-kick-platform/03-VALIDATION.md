---
phase: 3
slug: kick-platform
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.57.0 |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `npx playwright test --project=chromium-extension` |
| **Full suite command** | `npx playwright test --project=chromium-extension` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test tests/test-postmessage-origin.spec.ts` (Wave 1) / `npx playwright test tests/test-kick-injection.spec.ts` (Wave 2)
- **After every plan wave:** Run `npx playwright test --project=chromium-extension`
- **Before `/gsd:verify-work`:** Full suite must be green + manual KICK-03 verification
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-W0-01 | W0 | 0 | KICK-01 | unit fixture | `npx playwright test tests/test-kick-detection.spec.ts` | ❌ W0 | ⬜ pending |
| 3-W0-02 | W0 | 0 | KICK-02 | integration fixture | `npx playwright test tests/test-kick-injection.spec.ts` | ❌ W0 | ⬜ pending |
| 3-W0-03 | W0 | 0 | KICK-05 | unit fixture | `npx playwright test tests/test-postmessage-origin.spec.ts` | ❌ W0 | ⬜ pending |
| 3-W0-04 | W0 | 0 | KICK-06 | integration fixture | `npx playwright test tests/test-kick-spa-navigation.spec.ts` | ❌ W0 | ⬜ pending |
| 3-W0-05 | W0 | 0 | KICK-07 | unit fixture | `npx playwright test tests/test-kick-selector-fallback.spec.ts` | ❌ W0 | ⬜ pending |
| 3-01-01 | 01 | 1 | KICK-05 | unit | `npx playwright test tests/test-postmessage-origin.spec.ts` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 2 | KICK-01 | unit | `npx playwright test tests/test-kick-detection.spec.ts` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 2 | KICK-02 | integration | `npx playwright test tests/test-kick-injection.spec.ts` | ❌ W0 | ⬜ pending |
| 3-02-03 | 02 | 2 | KICK-06 | integration | `npx playwright test tests/test-kick-spa-navigation.spec.ts` | ❌ W0 | ⬜ pending |
| 3-02-04 | 02 | 2 | KICK-07 | unit | `npx playwright test tests/test-kick-selector-fallback.spec.ts` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | KICK-03 | manual | N/A — requires live kick.com | manual | ⬜ pending |
| 3-03-02 | 03 | 2 | KICK-04 | smoke | `ls dist/content-scripts/kick.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test-kick-detection.spec.ts` — stubs for KICK-01
- [ ] `tests/test-kick-injection.spec.ts` — stubs for KICK-02
- [ ] `tests/test-postmessage-origin.spec.ts` — stubs for KICK-05 (regression on Twitch + YouTube)
- [ ] `tests/test-kick-spa-navigation.spec.ts` — stubs for KICK-06
- [ ] `tests/test-kick-selector-fallback.spec.ts` — stubs for KICK-07
- [ ] `tests/fixtures/kick-mock.html` — Kick fixture HTML for offline injection tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extension loads on kick.com without chrome://extensions override | KICK-03 | Requires live kick.com stream page; not testable via fixture HTML | 1. Build extension (`npm run build`). 2. Load unpacked in Chrome. 3. Navigate to live kick.com stream. 4. Confirm iframe replaces native chat. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
