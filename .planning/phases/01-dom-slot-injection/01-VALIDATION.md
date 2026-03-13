---
phase: 1
slug: dom-slot-injection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.57.0 |
| **Config file** | `playwright.config.ts` (root) |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx playwright test` |
| **Estimated runtime** | ~30 seconds (type-check), ~120 seconds (full Playwright) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | INJ-07 | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | INJ-08 | static | `grep -r "INIT_DELAY" src/` | ✅ | ⬜ pending |
| 1-02-01 | 02 | 1 | INJ-01, INJ-02 | integration | `npx playwright test tests/test-slot-injection.spec.ts` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | INJ-03 | integration | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 1-03-01 | 03 | 2 | INJ-04, INJ-06 | integration | `npx playwright test tests/test-slot-injection.spec.ts` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 2 | INJ-05 | integration | `npx playwright test tests/test-spa-navigation.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test-slot-injection.spec.ts` — stubs for INJ-01, INJ-02, INJ-04, INJ-06: verifies `.chat-shell` contains `#allchat-container`, no `position:fixed` element, `ytd-live-chat-frame` hidden via `<style>` tag
- [ ] `tests/test-spa-navigation.spec.ts` — stubs for INJ-05: verifies teardown + re-init on YouTube navigation
- [ ] `tests/fixtures/twitch-mock.html` — needs `.chat-shell` element added (currently has `.right-column` only) for offline injection tests
- [ ] `tests/fixtures/youtube-mock.html` — update parent to match real YouTube flex layout with `ytd-live-chat-frame`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `yt-navigate-finish` triggers navigation on live YouTube | INJ-05 | Event is YouTube-internal, not reproducible in offline fixture | Open YouTube live stream, navigate to another video, confirm console shows "[AllChat YouTube] Navigation detected, tearing down..." |
| `.chat-shell` selector stability on live Twitch | INJ-01 | Twitch DOM selectors can change; fixture may lag live | Open Twitch stream page, confirm `#allchat-container` is child of `.chat-shell` in DevTools |
| Polymer re-render doesn't restore native YouTube chat | INJ-06 | Requires live YouTube Polymer lifecycle | Open YouTube live stream, navigate away and back, confirm `ytd-live-chat-frame` stays hidden |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
