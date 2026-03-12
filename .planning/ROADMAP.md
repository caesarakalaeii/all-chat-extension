# Roadmap: All-Chat Extension Revamp

## Overview

This milestone upgrades the all-chat extension from a fixed-position overlay to a proper DOM slot injection architecture, aligns the chat iframe with the all-chat design system (Tailwind 4, OkLCh tokens, InfinityLogo), adds full Kick platform support, and introduces LLM-agent-driven Playwright tests that verify visual and behavioral correctness without brittle CSS selectors. Phases execute in dependency order: slot injection first (unblocks iframe accessibility for tests), design system second (isolated to iframe CSS pipeline), Kick third (reuses the validated base class), and test infrastructure last (requires all platforms to be stable and injectable).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: DOM Slot Injection** - Replace fixed-position overlay with native DOM slot injection on Twitch and YouTube (completed 2026-03-12)
- [ ] **Phase 2: Design System** - Migrate to Tailwind 4 with OkLCh tokens and integrate InfinityLogo into the iframe UI
- [ ] **Phase 3: Kick Platform** - Add full Kick platform support reusing the validated injection base class
- [ ] **Phase 4: LLM Test Infrastructure** - Build LLM-agent-driven Playwright tests for all three platforms

## Phase Details

### Phase 1: DOM Slot Injection
**Goal**: Twitch and YouTube chat iframes are mounted inside their native DOM slots — the fixed-position overlay is completely removed
**Depends on**: Nothing (first phase)
**Requirements**: INJ-01, INJ-02, INJ-03, INJ-04, INJ-05, INJ-06, INJ-07, INJ-08
**Success Criteria** (what must be TRUE):
  1. Twitch chat renders inside `.chat-shell` — no `position:fixed` element exists on a Twitch stream page when the extension is active
  2. YouTube chat renders in the flex slot that previously held `ytd-live-chat-frame` — native YouTube chat is hidden via an injected `<style>` tag and does not reappear after SPA navigation
  3. `waitForElement()` utility is in `PlatformDetector` base class — both Twitch and YouTube content scripts call it from there rather than implementing their own wait loops
  4. Navigating between YouTube videos does not leave behind orphaned containers or duplicate injection points
  5. No hardcoded `TWITCH_INIT_DELAY` or `YOUTUBE_INIT_DELAY` constants exist anywhere in the codebase
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Base class infrastructure: waitForElement(), teardown(), async createInjectionPoint() signature + Wave 0 test scaffolding
- [ ] 01-02-PLAN.md — Twitch slot injection: async createInjectionPoint() targeting .chat-shell, scoped MutationObserver, teardown override
- [ ] 01-03-PLAN.md — YouTube slot injection: style-tag native chat hide, insertBefore injection, yt-navigate-finish SPA navigation

### Phase 2: Design System
**Goal**: The chat iframe renders with OkLCh design tokens, Inter/DM Mono typography, and the InfinityLogo SVG — Tailwind 3 is fully replaced by Tailwind 4 with no style leakage to the platform page
**Depends on**: Phase 1
**Requirements**: DS-01, DS-02, DS-03, DS-04, DS-05, DS-06, DS-07, DS-08, DS-09, DS-10
**Success Criteria** (what must be TRUE):
  1. The built `dist/ui/chat-styles.css` file contains OkLCh color utilities (e.g., `flex`, token-based color classes) — `tailwind.config.js` no longer exists in the repo
  2. Platform page `:root` has no `--color-neutral-*` variables — all design tokens are scoped to the iframe `:root` only
  3. The InfinityLogo animated SVG is visible in the chat header when the iframe loads
  4. Chat UI renders with Inter for body text and DM Mono for code/monospace — not the platform page's font stack
  5. Uncaught React errors inside the iframe show a readable fallback instead of a blank iframe
**Plans**: 5 plans

Plans:
- [ ] 02-01-PLAN.md — Wave 0 test scaffold: DS-01 through DS-10 skip-stubs in test-design-system.spec.ts
- [ ] 02-02-PLAN.md — Build tooling: Tailwind 4 + MiniCssExtractPlugin + postcss migration + tailwind-merge v3
- [ ] 02-03-PLAN.md — CSS pipeline: styles.css @theme block + fontsource imports + chat-container.html link tag
- [ ] 02-04-PLAN.md — Component migration: ChatContainer header redesign + InfinityLogo + token class rewrite across all 5 components
- [ ] 02-05-PLAN.md — ErrorBoundary: class component + ChatContainer wrapper in index.tsx

### Phase 3: Kick Platform
**Goal**: Kick.com live stream pages display the all-chat iframe in the native chat slot — all five required manifest and webpack locations are updated and the extension functions without manual configuration
**Depends on**: Phase 1
**Requirements**: KICK-01, KICK-02, KICK-03, KICK-04, KICK-05, KICK-06, KICK-07
**Success Criteria** (what must be TRUE):
  1. Loading a live Kick stream page with the extension installed shows the all-chat iframe in place of the native Kick chat
  2. Navigating from one Kick stream to another (SPA navigation) correctly reinjects the iframe in the new stream's chat slot
  3. `manifest.json` declares Kick `content_scripts`, `host_permissions`, and `web_accessible_resources` entries — the extension loads on kick.com without manual `chrome://extensions` override
  4. `postMessage` origin validation in `PlatformDetector` rejects messages from unexpected origins — no regression on Twitch or YouTube
**Plans**: TBD

### Phase 4: LLM Test Infrastructure
**Goal**: An LLM-agent-driven Playwright test suite exercises at least one end-to-end scenario per platform against fixture HTML pages — agent tests run separately from the fast CI suite and are documented with the required API key
**Depends on**: Phase 3
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07
**Success Criteria** (what must be TRUE):
  1. Running `npm test` (fast suite) completes without touching any LLM-agent tests — agent tests only run when explicitly tagged with `@agent`
  2. At least one agent test per platform (Twitch, YouTube, Kick) passes against a local fixture HTML page: chat visible, platform badge correct, message send flow completes
  3. `frameLocator('iframe[data-platform]')` is used for all in-iframe Playwright assertions — no test reaches into the iframe via `page.$` or raw CSS selectors on the platform page
  4. CI configuration documents `ANTHROPIC_API_KEY` as a required secret for the agent suite — missing key causes a clear error, not a silent skip
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. DOM Slot Injection | 3/3 | Complete   | 2026-03-12 |
| 2. Design System | 3/5 | In Progress|  |
| 3. Kick Platform | 0/TBD | Not started | - |
| 4. LLM Test Infrastructure | 0/TBD | Not started | - |
