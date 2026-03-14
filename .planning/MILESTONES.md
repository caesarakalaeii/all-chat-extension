# Milestones

## v1.0 MVP (Shipped: 2026-03-14)

**Phases completed:** 4 phases, 15 plans, ~27 tasks
**Timeline:** 2026-03-12 → 2026-03-13 (2 days)
**Source LOC:** 4,862 TypeScript

**Key accomplishments:**
- Replaced fixed-position overlay with native DOM slot injection on Twitch (`.chat-shell`) and YouTube (flex slot before `ytd-live-chat-frame`), eliminating z-index bugs and enabling natural layout integration
- Migrated chat iframe to Tailwind 4 with OkLCh design tokens, Inter/DM Mono typography, and InfinityLogo animated SVG — CSS fully isolated to iframe with no platform page leakage
- Added Kick.com platform support: API-based live detection, `#channel-chatroom` slot injection with 3-selector fallback chain, SPA navigation via popstate + MutationObserver
- Hardened postMessage security: iframe init migrated to URL params (replaces postMessage); extensionOrigin enforced in all content script relay calls
- Built 32-test Playwright suite using `launchPersistentContext` + `context.route()` for real Chrome extension testing with mock WebSocket server on port 8080
- Added GitHub Actions CI job running fast suite (`xvfb-run -a npm test`) after every build, gating PRs before release

**Known gaps accepted as tech debt:**
- TEST-03 (LlmAgent/Stagehand class): replaced by manual Claude MCP scenario scripts in `tests/agent/`
- TEST-07 (ANTHROPIC_API_KEY in CI): dropped — no automated agent runner

---

