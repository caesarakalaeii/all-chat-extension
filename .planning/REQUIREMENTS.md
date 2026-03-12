# Requirements: All-Chat Extension Revamp

**Defined:** 2026-03-12
**Core Value:** The chat replacement must be visually seamless and feel native — users should not perceive any difference from the platform's own chat, except that it looks better and supports all platforms at once.

## v1 Requirements

### Injection

- [x] **INJ-01**: Twitch chat iframe is mounted in the native `.chat-shell` DOM slot, not appended to `document.body` as a fixed overlay
- [x] **INJ-02**: Fixed-position overlay code path (`createInjectionPoint()` body append) is fully removed — no silent fallback
- [x] **INJ-03**: MutationObserver is scoped to the native chat slot parent only (not `document.body subtree: true`)
- [x] **INJ-04**: YouTube chat iframe is mounted by hiding `ytd-live-chat-frame` and inserting our container in the same flex slot
- [x] **INJ-05**: YouTube SPA navigation uses `yt-navigate-finish` event instead of URL-polling MutationObserver
- [x] **INJ-06**: YouTube native chat is hidden via injected `<style>` tag (not inline style) so Polymer recreation on navigation doesn't restore it
- [x] **INJ-07**: `waitForElement()` utility extracted to `PlatformDetector` base class, shared by all content scripts
- [x] **INJ-08**: Fixed `TWITCH_INIT_DELAY` and `YOUTUBE_INIT_DELAY` constants removed; injection waits for DOM readiness instead

### Design System

- [x] **DS-01**: Tailwind 3 fully replaced by Tailwind 4 (`tailwindcss@^4.1` + `@tailwindcss/postcss`); `tailwind.config.js` deleted
- [x] **DS-02**: OkLCh design tokens from `all-chat/frontend/src/app/globals.css` applied to iframe `@theme` block (colors, text sizes, spacing, radii)
- [x] **DS-03**: `MiniCssExtractPlugin` used for iframe CSS bundle (replaces `style-loader`) — CSS injected via `<link>` in `chat-container.html`
- [x] **DS-04**: Iframe CSS tokens are confirmed isolated to iframe `:root` — no `--color-neutral-*` variables on platform page `:root`
- [x] **DS-05**: `InfinityLogo` SVG component integrated into chat header (animated infinity sign in chat bubble)
- [x] **DS-06**: Inter font and DM Mono applied to chat UI (scoped to iframe only)
- [x] **DS-07**: Platform color accents updated to match design system (`--color-twitch: #A37BFF`, `--color-youtube: #FF4444`, `--color-kick: #53FC18`)
- [x] **DS-08**: `autoprefixer` removed from PostCSS config (Tailwind 4 handles vendor prefixes natively)
- [x] **DS-09**: `tailwind-merge` upgraded to v3 (compatible with Tailwind 4 class names)
- [x] **DS-10**: `ErrorBoundary` wraps `ChatContainer` — uncaught errors show a readable fallback instead of blank iframe

### Kick Platform

- [x] **KICK-01**: `kick.ts` content script detects live stream on kick.com via URL pattern and DOM state
- [x] **KICK-02**: Kick chat iframe mounted in `#channel-chatroom` slot (native chat hidden)
- [x] **KICK-03**: `manifest.json` updated with Kick `content_scripts`, `host_permissions`, and `web_accessible_resources` entries
- [x] **KICK-04**: Webpack entry added for `content-scripts/kick`
- [x] **KICK-05**: `postMessage` origin validation in `PlatformDetector` base class fixed before Kick ships (kick.com embeds more third-party iframes)
- [x] **KICK-06**: Kick SPA navigation handled via `popstate` + `pushState` intercept
- [x] **KICK-07**: Kick selector fallback chain in place (`#channel-chatroom` → `#chatroom` → `.chatroom-wrapper`) with date-comment for maintenance

### Testing Infrastructure

- [ ] **TEST-01**: Mock WebSocket server (`tests/fixtures/mock-ws-server.ts`) provides deterministic chat messages for all test scenarios
- [ ] **TEST-02**: Fixture HTML pages for Twitch, YouTube, and Kick served locally for offline injection tests
- [ ] **TEST-03**: `LlmAgent` helper class (`tests/helpers/llm-agent.ts`) wraps Stagehand `act()` / `extract()` / `observe()` interface
- [ ] **TEST-04**: Agent test specs in `tests/agent/` tagged `@agent` — excluded from default CI fast run
- [ ] **TEST-05**: At least one passing LLM-agent scenario per platform: chat visible, platform badge correct, message send flow
- [ ] **TEST-06**: `frameLocator('iframe[data-platform]')` used for all in-iframe Playwright assertions (requires slot injection from INJ phase)
- [ ] **TEST-07**: CI configuration documents `ANTHROPIC_API_KEY` as required for agent test suite

## v2 Requirements

### Visual Polish

- **VIS-01**: Resizable chat panel (drag handle to resize width) — depends on slot injection being stable; defer to avoid coupling
- **VIS-02**: Popup full redesign to match design system — functional popup is acceptable for v1
- **VIS-03**: Animated emote rendering (GIFs / APNG) — defer; scroll performance risk

### Platform Extensions

- **PLAT-01**: TikTok platform support — defer; primarily mobile, no meaningful desktop live stream surface
- **PLAT-02**: Multi-stream simultaneous chat — architectural redesign of connection pool; defer

### Performance

- **PERF-01**: Emote cache persistence across sessions — valuable but not blocking
- **PERF-02**: Virtual list for high-traffic chats (>100 msg/min) — not an issue at current scale

## Out of Scope

| Feature | Reason |
|---------|--------|
| TikTok support | Primarily mobile; no desktop live streaming surface worth targeting |
| Multi-stream simultaneous chat | Requires connection-pool redesign; separate milestone |
| Video controls / player interaction | Out of charter; we replace chat only |
| Vite migration | No functional gain this milestone; CRXJS plugin maintenance uncertainty |
| Mobile extension | Chrome extensions are desktop-only |

## Traceability

_Populated during roadmap creation._

| Requirement | Phase | Status |
|-------------|-------|--------|
| INJ-01 | Phase 1 | Complete |
| INJ-02 | Phase 1 | Complete |
| INJ-03 | Phase 1 | Complete |
| INJ-04 | Phase 1 | Complete |
| INJ-05 | Phase 1 | Complete |
| INJ-06 | Phase 1 | Complete |
| INJ-07 | Phase 1 | Complete |
| INJ-08 | Phase 1 | Complete |
| DS-01 | Phase 2 | Complete |
| DS-02 | Phase 2 | Complete |
| DS-03 | Phase 2 | Complete |
| DS-04 | Phase 2 | Complete |
| DS-05 | Phase 2 | Complete |
| DS-06 | Phase 2 | Complete |
| DS-07 | Phase 2 | Complete |
| DS-08 | Phase 2 | Complete |
| DS-09 | Phase 2 | Complete |
| DS-10 | Phase 2 | Complete |
| KICK-01 | Phase 3 | Complete |
| KICK-02 | Phase 3 | Complete |
| KICK-03 | Phase 3 | Complete |
| KICK-04 | Phase 3 | Complete |
| KICK-05 | Phase 3 | Complete |
| KICK-06 | Phase 3 | Complete |
| KICK-07 | Phase 3 | Complete |
| TEST-01 | Phase 4 | Pending |
| TEST-02 | Phase 4 | Pending |
| TEST-03 | Phase 4 | Pending |
| TEST-04 | Phase 4 | Pending |
| TEST-05 | Phase 4 | Pending |
| TEST-06 | Phase 4 | Pending |
| TEST-07 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after initial definition*
