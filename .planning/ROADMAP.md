# Roadmap: All-Chat Extension Revamp

## Overview

This milestone upgrades the all-chat extension from a fixed-position overlay to a proper DOM slot injection architecture, aligns the chat iframe with the all-chat design system (Tailwind 4, OkLCh tokens, InfinityLogo), adds full Kick platform support, and introduces LLM-agent-driven Playwright tests that verify visual and behavioral correctness without brittle CSS selectors. Phases execute in dependency order: slot injection first (unblocks iframe accessibility for tests), design system second (isolated to iframe CSS pipeline), Kick third (reuses the validated base class), and test infrastructure last (requires all platforms to be stable and injectable).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: DOM Slot Injection** - Replace fixed-position overlay with native DOM slot injection on Twitch and YouTube (completed 2026-03-12)
- [x] **Phase 2: Design System** - Migrate to Tailwind 4 with OkLCh tokens and integrate InfinityLogo into the iframe UI (completed 2026-03-12)
- [ ] **Phase 3: Kick Platform** - Add full Kick platform support reusing the validated injection base class
- [x] **Phase 4: LLM Test Infrastructure** - Build LLM-agent-driven Playwright tests for all three platforms (completed 2026-03-13)

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
**Plans**: 4 plans

Plans:
- [ ] 03-01-PLAN.md — Wave 0 test scaffold: skip-stubs for KICK-01 through KICK-07 + kick-mock.html fixture
- [ ] 03-02-PLAN.md — postMessage origin hardening: replace '*' with extensionOrigin in PlatformDetector, twitch.ts, youtube.ts, index.tsx
- [ ] 03-03-PLAN.md — KickDetector content script: selector checkpoint + kick.ts implementation (isLiveStream, injection, SPA nav)
- [ ] 03-04-PLAN.md — Manifest + webpack wiring: Kick entries in manifest.json and webpack.config.js, build verification

### Phase 4: LLM Test Infrastructure
**Goal**: An LLM-agent-driven Playwright test suite exercises at least one end-to-end scenario per platform against fixture HTML pages — agent tests run separately from the fast CI suite and are documented with the required API key
**Depends on**: Phase 3
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07
**Success Criteria** (what must be TRUE):
  1. Running `npm test` (fast suite) completes without touching any LLM-agent tests — agent tests only run when explicitly tagged with `@agent`
  2. At least one agent test per platform (Twitch, YouTube, Kick) passes against a local fixture HTML page: chat visible, platform badge correct, message send flow completes
  3. `frameLocator('iframe[data-platform]')` is used for all in-iframe Playwright assertions — no test reaches into the iframe via `page.$` or raw CSS selectors on the platform page
  4. CI configuration documents `ANTHROPIC_API_KEY` as a required secret for the agent suite — missing key causes a clear error, not a silent skip
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md — Infrastructure: mock WS server, globalSetup/globalTeardown, npm test scripts, playwright.config.ts
- [ ] 04-02-PLAN.md — Fast suite implementation: unskip static fs tests, implement page.route() fixture tests, frameLocator assertions
- [ ] 04-03-PLAN.md — Agent scenarios + CI job: twitch/youtube/kick scenario markdown files, GitHub Actions test job

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. DOM Slot Injection | 3/3 | Complete   | 2026-03-12 |
| 2. Design System | 5/5 | Complete   | 2026-03-12 |
| 3. Kick Platform | 3/4 | In Progress|  |
| 4. LLM Test Infrastructure | 3/3 | Complete   | 2026-03-13 |
| 5. Per-site enable/disable | 1/5 | In Progress|  |

### Phase 5: Per-site enable/disable

**Goal**: The single global enable/disable toggle is replaced by three per-platform toggles (Twitch, YouTube, Kick) — users can independently control which platforms have AllChat active, with immediate effect via messaging (no page reload), grayscale toolbar icon for disabled platforms, and seamless migration from the legacy `extensionEnabled` boolean
**Requirements**: D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08
**Depends on:** Phase 4
**Success Criteria** (what must be TRUE):
  1. Popup shows three independent platform toggles (Twitch, YouTube, Kick) — no global toggle exists
  2. Toggling a platform takes effect immediately without page reload — content scripts handle re-enable via `EXTENSION_STATE_CHANGED` message
  3. Current tab's platform row is highlighted in the popup with a platform-colored left border
  4. Toolbar icon shows grayscale for tabs where the platform is disabled, color for enabled
  5. Existing users with `extensionEnabled` are seamlessly migrated to `platformEnabled` on first read
  6. All three platforms default to enabled on fresh install
**Plans:** 1/5 plans executed

Plans:
- [x] 05-00-PLAN.md — Wave 0 test stubs: skip-stub specs for per-site-enable and storage-migration tests
- [x] 05-01-PLAN.md — Storage schema: PlatformEnabled type, SyncStorage migration, grayscale icon assets
- [x] 05-02-PLAN.md — Content scripts: per-platform init check + re-enable path in all four scripts
- [x] 05-03-PLAN.md — Popup + service worker: three per-platform toggles, active row highlight, grayscale icon per-tab
- [x] 05-04-PLAN.md — E2E tests + README: Playwright test suite for toggle flows, documentation update

### Phase 6: Add pop-out button for standalone chat overlay

**Goal:** The AllChat header has a pop-out button that opens chat in a standalone browser window, with bidirectional switching between AllChat and native platform chat in both in-page and pop-out contexts — message history transfers to the pop-out, window dimensions persist, and closing the pop-out restores in-page chat automatically
**Requirements**: D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-17
**Depends on:** Phase 5
**Plans:** 5 plans

Plans:
- [ ] 06-01-PLAN.md — Types, storage schema, and Wave 0 test stubs for pop-out and native switch
- [ ] 06-02-PLAN.md — ChatContainer UI: pop-out mode detection, header buttons, popped-out banner, Port communication
- [ ] 06-03-PLAN.md — Service worker port broadcast + PlatformDetector pop-out lifecycle methods
- [ ] 06-04-PLAN.md — Wire pop-out and native-switch messages into all four content scripts
- [ ] 06-05-PLAN.md — Native pop-out injection (Twitch/YouTube), manifest update, bidirectional navigation + human verify

### Phase 7: Twitch Native Widget Extraction

**Goal:** Twitch-native interactive features (channel points, predictions, polls, raids) remain fully accessible when AllChat is active — widgets are extracted from the native chat DOM and repositioned alongside the AllChat iframe, with a tab bar switcher for instant toggling between AllChat and native chat views
**Requirements**: WIDGET-01, WIDGET-02, WIDGET-03, WIDGET-04, WIDGET-05, WIDGET-06, WIDGET-07, WIDGET-08
**Depends on:** Phase 6
**Success Criteria** (what must be TRUE):
  1. Channel points balance, claim button, and redemption menu are visible and functional while AllChat is the active chat view
  2. Predictions and polls UI is accessible without switching to native chat
  3. A persistent tab bar (`[AllChat] | [Twitch Chat]`) replaces the current small "switch to native" button — switching is instant with no state loss in either view
  4. Native chat stays mounted (hidden) when AllChat tab is active — no reload on switch
  5. The approach generalizes to YouTube and Kick native features in future phases
**Plans:** 5 plans

Plans:
- [x] 07-01-PLAN.md — Wave 0 test scaffold: skip-stubs for WIDGET-01 through WIDGET-08 + twitch-mock.html widget fixtures
- [x] 07-02-PLAN.md — Tab bar injection + layout restructure: #allchat-tab-bar, flex column with widget zones, full swap toggling
- [x] 07-03-PLAN.md — ChatContainer tabBarMode: conditional header hiding, floating pop-out button, TAB_BAR_MODE message handling
- [x] 07-04-PLAN.md — Widget extraction core: clone + event forwarding, MutationObserver sync, widget zone management
- [x] 07-05-PLAN.md — README update + human verification: tab bar, widget extraction, regression check on all platforms
