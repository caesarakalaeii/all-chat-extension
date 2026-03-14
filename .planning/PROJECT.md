# All-Chat Extension

## What This Is

A Chrome extension that replaces native chat on Twitch, YouTube, and Kick with a unified, premium multi-platform chat interface. It intercepts the native chat DOM slot and drops in an iframe-based React UI that matches the all-chat design system — no overlapping containers, no visual artifacts. The extension connects to the allch.at backend via a service worker WebSocket relay.

## Core Value

The chat replacement must be visually seamless and feel native — users should not perceive any difference from the platform's own chat, except that it looks better and supports all platforms at once.

## Requirements

### Validated (v1.0)

- ✓ Chrome Manifest V3 extension with service worker hub — existing
- ✓ Twitch live stream detection and iframe injection — existing
- ✓ Real-time WebSocket chat relay via service worker — existing
- ✓ Message rendering with emotes and Twitch badges — existing
- ✓ Twitch OAuth login and authenticated message sending — existing
- ✓ Auto-reconnection with exponential backoff and UI feedback — existing
- ✓ Toast notifications for auth/connection events — existing
- ✓ Emote autocomplete triggered by `:` — existing
- ✓ YouTube live stream detection (partial) — existing
- ✓ DOM slot injection: Twitch chat in `.chat-shell`, YouTube chat in flex slot — v1.0
- ✓ Fixed-position overlay fully removed — v1.0
- ✓ OkLCh design tokens, Inter/DM Mono typography, InfinityLogo SVG in iframe — v1.0
- ✓ Tailwind 4 migration, MiniCssExtractPlugin CSS pipeline, iframe CSS isolation — v1.0
- ✓ ErrorBoundary wrapping ChatContainer — v1.0
- ✓ Kick.com platform support (detection, injection, SPA nav, manifest wiring) — v1.0
- ✓ postMessage hardening (URL-param init, extensionOrigin relay) — v1.0
- ✓ 32-test Playwright suite with launchPersistentContext + mock WebSocket server — v1.0
- ✓ GitHub Actions CI job (xvfb-run fast suite, gates PRs) — v1.0

### Active

- [ ] Resizable chat panel (drag handle to resize width) — slot injection stable, can proceed
- [ ] Popup redesign to match design system — functional popup acceptable for v1.1
- [ ] Verify Kick.com live selectors still valid (date-comment: 2026-03-12)
- [ ] Un-skip 5 DS tests (DS-04/05/06/07/10) — requires iframe fixture infrastructure

### Out of Scope

- TikTok support — primarily mobile, no meaningful desktop live streaming use case
- Mobile extension — Chrome extensions are desktop-only
- Multi-stream simultaneous chat — requires connection-pool redesign; separate milestone
- Video controls / player interaction — out of charter; we replace chat only
- Vite migration — no functional gain; CRXJS plugin maintenance uncertainty

## Context

**Shipped v1.0 with 4,862 LOC TypeScript (2026-03-12 → 2026-03-13)**

Tech stack: Webpack 5, React 18, Tailwind 4, Playwright, ws@8.x
Build output: `dist/` (content scripts + `ui/chat-container.html` + `ui/chat-styles.css`)
Test suite: `npm test` (32 passing, 5 skipped) + `npm run test:agent` (manual MCP sessions)
CI: GitHub Actions `test` job runs after every build, `xvfb-run -a npm test`

Injection architecture: Each platform's content script extends `PlatformDetector`, which provides `waitForElement()`, `teardown()`, and iframe injection via URL params (`?platform=...&streamer=...`). Platform-specific subclasses implement `createInjectionPoint()` and `setupUrlWatcher()`.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep iframe for CSS isolation | Shadow DOM is an alternative but iframe is simpler and proven | ✓ Good — no style leakage issues in v1.0 |
| Mount iframe in native DOM slot | Eliminates overlap/z-index class of bugs entirely; enables resizable panel | ✓ Good — clean slot injection on all 3 platforms |
| Recreate design system components (no @base-ui) | @base-ui adds too much weight for an extension content bundle | ✓ Good — 4,862 LOC, lean bundle |
| Playwright + Claude MCP for testing | Brittle selector tests break on platform DOM changes; AI-driven tests are resilient | ✓ Good — 32 passing tests, MCP scenarios documented |
| URL-param iframe init (replaces postMessage) | Content scripts report page origin (not extension origin) — postMessage-based init would be blocked by KICK-05 origin check | ✓ Good — simpler and more secure |
| Kick live detection via API | No stable DOM live badge; `kick.com/api/v2/channels/{slug}` returns authoritative state | ✓ Good — reliable detection |
| MutationObserver on title for Kick SPA (not pushState monkey-patch) | pushState intercept is infeasible from isolated content script world | ✓ Good — documented in RESEARCH.md |

## Constraints

- **Bundle size:** Extension UI bundle must stay lean — avoid heavy libraries (@base-ui adds 200KB+).
- **CSS isolation:** Tailwind styles must be scoped to the iframe — platform pages must never leak styles into our UI or vice versa.
- **Manifest V3:** No background page, service worker only. All async patterns must handle SW lifecycle correctly.
- **Iframe same-origin:** `chat-container.html` is a web-accessible resource — URL-param architecture for init preserved.
- **Platform stability:** DOM injection relies on MutationObserver + retry — platform SPA navigation must be handled correctly for all 3 platforms. Kick selectors need periodic verification.

---
*Last updated: 2026-03-14 after v1.0 milestone*
