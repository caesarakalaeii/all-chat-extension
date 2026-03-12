# All-Chat Extension

## What This Is

A Chrome extension that replaces native chat on Twitch, YouTube, and Kick with a unified, premium multi-platform chat interface. It intercepts the native chat DOM slot and drops in an iframe-based React UI that matches the all-chat design system — no overlapping containers, no visual artifacts. The extension connects to the allch.at backend via a service worker WebSocket relay.

## Core Value

The chat replacement must be visually seamless and feel native — users should not perceive any difference from the platform's own chat, except that it looks better and supports all platforms at once.

## Requirements

### Validated

- ✓ Chrome Manifest V3 extension with service worker hub — existing
- ✓ Twitch live stream detection and iframe injection — existing
- ✓ Real-time WebSocket chat relay via service worker — existing
- ✓ Message rendering with emotes and Twitch badges — existing
- ✓ Twitch OAuth login and authenticated message sending — existing
- ✓ Auto-reconnection with exponential backoff and UI feedback — existing
- ✓ Toast notifications for auth/connection events — existing
- ✓ Emote autocomplete triggered by `:` — existing
- ✓ YouTube live stream detection (partial) — existing

### Active

- [ ] Apply all-chat design system (OkLCh color tokens, typography scale, spacing, component patterns)
- [ ] Integrate InfinityLogo component (animated SVG infinity sign in chat bubble)
- [ ] Replace fixed-position overlay with iframe mounted in the native chat DOM slot — Twitch
- [ ] Replace fixed-position overlay with iframe mounted in the native chat DOM slot — YouTube
- [ ] Complete YouTube chat replacement (currently stubs out at detection)
- [ ] Add Kick platform support (detection, injection, chat rendering)
- [ ] Build LLM-agent testing infrastructure (Playwright + AI agent drives browser end-to-end)
- [ ] Resizable chat panel (drag to resize width)
- [ ] Popup redesign to match new design system

### Out of Scope

- TikTok support — primarily mobile, no meaningful desktop live streaming use case
- Mobile extension — Chrome extensions are desktop-only
- Native app — out of scope for this milestone

## Context

The `../all-chat` frontend was recently revamped with a new design system:
- **Colors:** OkLCh-based tokens (`--color-neutral-950` through `--color-neutral-100`), platform colors (Twitch `#A37BFF`, YouTube `#FF4444`, Kick `#53FC18`)
- **Typography:** Inter + DM Mono, custom scale (0.6875rem–2rem)
- **Components:** @base-ui/react primitives + CVA variants
- **Logo:** `InfinityLogo.tsx` — animated 4-color SVG infinity sign inside a chat bubble

Extension currently uses vanilla Tailwind 3 with `gray-*` colors. Build system is Webpack 5. React 18. The iframe architecture provides strong CSS isolation and should be kept — the fix is where the iframe is mounted (native slot instead of fixed overlay).

Existing Playwright test setup is in place. Goal is to add LLM-agent-driven tests where an AI (Claude/GPT) acts as the "user" in browser automation — clicks, types, makes assertions based on visual/semantic understanding rather than brittle CSS selectors.

## Constraints

- **Bundle size:** Extension UI bundle must stay lean — avoid heavy libraries (@base-ui adds 200KB+). Recreate components with CVA + raw HTML where needed.
- **CSS isolation:** Tailwind styles must be scoped to the iframe — platform pages must never leak styles into our UI or vice versa.
- **Manifest V3:** No background page, service worker only. All async patterns must handle SW lifecycle correctly.
- **Iframe same-origin:** `chat-container.html` is a web-accessible resource — postMessage architecture must be preserved.
- **Platform stability:** DOM injection relies on MutationObserver + retry — platform SPA navigation must be handled correctly for all 3 platforms.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep iframe for CSS isolation | Shadow DOM is an alternative but iframe is simpler and proven | — Pending |
| Mount iframe in native DOM slot | Replace native chat container rather than fixed-position overlay — eliminates overlap class of bugs entirely | — Pending |
| Recreate design system components (no @base-ui) | @base-ui adds too much weight for an extension content bundle | — Pending |
| Playwright + LLM agent for testing | Brittle selector-based tests break on platform DOM changes; AI-driven tests are resilient and test what users actually see | — Pending |

---
*Last updated: 2026-03-12 after initialization*
