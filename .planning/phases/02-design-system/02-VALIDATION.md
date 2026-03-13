---
phase: 2
slug: design-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright `^1.57.0` |
| **Config file** | `playwright.config.ts` (root) |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npx playwright test` |
| **Estimated runtime** | ~60 seconds (build + extension load + iframe inspection) |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds (build only), ~60 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | DS-01 | build smoke | `npm run build && ! ls tailwind.config.js 2>/dev/null` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | DS-08 | file check | `grep -c 'autoprefixer' postcss.config.js; [ $? -ne 0 ]` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | DS-09 | package check | `node -e "const v=require('./node_modules/tailwind-merge/package.json').version; if(parseInt(v)<3) process.exit(1)"` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | DS-02 | build artifact | `grep -c 'oklch' dist/ui/chat-styles.css` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | DS-03 | build artifact | `ls dist/ui/chat-styles.css && grep -c 'chat-styles.css' dist/ui/chat-container.html` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 1 | DS-04 | Playwright | `page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-neutral-900'))` returns empty | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | DS-06 | Playwright | `frameLocator.locator('body')` computed `font-family` contains 'Inter' | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 2 | DS-07 | Playwright | `frameLocator` + `getPropertyValue('--color-twitch')` returns `#A37BFF` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 2 | DS-05 | Playwright | `page.frameLocator('iframe[data-platform]').locator('svg')` is visible | ❌ W0 | ⬜ pending |
| 2-05-01 | 05 | 3 | DS-10 | Playwright | Force error in child; assert fallback card visible via frameLocator | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test-design-system.spec.ts` — stubs for DS-01 through DS-10 (build artifact checks + iframe inspection)
- [ ] Tests require `npm run build` to run first (build-dependent assertions)
- [ ] DS-05/DS-06/DS-10 require extension loaded in Playwright (`dist/` must exist with new CSS)

*Note: All DS requirement tests are Wave 0 gaps — no existing test file covers design system assertions.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| InfinityLogo animation plays (requestAnimationFrame loop) | DS-05 | Animation timing is runtime-only | Load iframe, observe SVG animates continuously |
| Inter/DM Mono visually render (not fallback system font) | DS-06 | Font rendering requires visual inspection | Open DevTools → Computed → font-family on chat body and code elements |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
