# Feature Landscape

**Domain:** Multi-platform streaming chat browser extension (Twitch / YouTube / Kick)
**Researched:** 2026-03-12
**Confidence note:** Web search and Bash were unavailable during this session. All findings derive from training data (cutoff August 2025) cross-referenced with the existing codebase. Confidence levels are assigned conservatively.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or users revert to native chat.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Real-time chat messages | Core purpose of the product | Low | Already exists. 50-message cap is a known concern (CONCERNS.md). |
| Emote rendering (Twitch native, 7TV, BTTV, FFZ) | Every Twitch viewer uses emote extensions; bare text feels broken | Medium | Already exists. Cache-miss on navigation is a known perf concern. |
| Username colors | Standard since IRC era; users associate color with identity | Low | Already exists via `message.user.color`. |
| Badges (subscriber, mod, broadcaster) | Moderators expect to see their status; viewers expect hierarchy cues | Medium | Already exists. Badge icon resolution is async and can lag. |
| Message input / send | Chat is bidirectional | Medium | Already exists via `MessageInput`. |
| Emote autocomplete (`:` trigger) | Power-user muscle memory across every Twitch client | Medium | Already exists. |
| Connection status indicator | Users must know if they're watching a dead connection | Low | Already exists (connected / reconnecting / failed states). |
| Collapsed/expanded toggle | Chat takes screen space; viewers watching video need to hide it | Low | Already exists. Currently `48px` collapsed icon. |
| Auth login / logout | Send requires identity; logout must be discoverable | Low | Already exists. |
| Auto-reconnect with backoff | Stream hiccups happen; silent reconnect is expected | Medium | Exists but backoff is linear, not exponential (CONCERNS.md). |
| Platform indicator per message | Multi-platform chat requires source disambiguation | Low | Already exists as `(platform)` label. Needs design polish. |
| Error recovery UI | Failed connection must be actionable, not a dead end | Low | Exists (Retry button). Needs design polish. |

**Verdict on existing table stakes:** All core table stakes are present. The gap is visual quality (gray-900 Tailwind theme vs the all-chat design system) and YouTube/Kick completeness.

---

## Differentiators

Features that set all-chat apart from native chat and single-platform extensions.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Unified multi-platform chat (Twitch + YouTube + Kick in one panel) | The core differentiator — no other extension does this natively | High | Core product bet. Currently Twitch works; YouTube and Kick are targets for this milestone. |
| Design system consistency with all-chat web app | Extension feels like a first-party companion, not a third-party overlay | Medium | OkLCh tokens, Inter/DM Mono, InfinityLogo. Webpack must bundle tokens without leaking to host page. |
| Iframe DOM-slot mounting (not fixed overlay) | Eliminates class of layout bugs; chat respects the platform's own panel geometry | High | KEY architectural improvement. Fixed overlay is the current approach; slot mounting is the goal. Must handle all 3 platforms. |
| Resizable panel | Power users resize to their preferences; overlays with fixed width frustrate widescreen setups | Medium | Planned (drag to resize width). Requires postMessage to propagate width from iframe outward to container. |
| Popup redesign | Extension popup is first impression on install; polished popup signals quality | Low | Currently functional but unpolished. |
| Emote cache persistence across navigation | Eliminates the 7TV/BTTV/FFZ re-fetch on every stream navigation — feels noticeably faster | Medium | Cache should survive SPA navigation (store in service worker, not component state). |
| Per-platform color theming | Platform accent colors (Twitch purple `#A37BFF`, YouTube red `#FF4444`, Kick green `#53FC18`) give immediate spatial orientation | Low | Design-system tokens already defined in all-chat; wire into the extension iframe. |
| LLM-agent test coverage | Extension survives platform DOM changes because tests verify behavior, not selectors | High | See dedicated LLM Testing section below. |
| Error boundary protection | Uncaught render errors don't crash the entire chat iframe — degraded state is better than blank | Low | Missing entirely (CONCERNS.md). |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Multi-streamer simultaneous chat (multiple WebSocket connections) | Hard architectural constraint: single WebSocket in service worker. Adding multi-stream requires a connection-manager redesign that is out of scope. Doing it wrong causes connection state corruption. | Accept single-streamer model; document it. Revisit in a future milestone with a named connection pool. |
| TikTok support | Declared out of scope in PROJECT.md. Mobile-first platform, no meaningful desktop live chat surface. DOM is extremely volatile. | Do not implement. |
| Chat moderation actions (ban, timeout, slow mode) | Requires platform OAuth scopes beyond viewer auth. Adds auth complexity and surfaces regulatory/ToS risk with each platform. | Out of scope. Viewer-send is sufficient. |
| Custom notification sounds / overlays | Streamer-alert territory. Better served by dedicated alert tools (Streamlabs, etc.). Would bloat bundle. | Out of scope. |
| Chat filters / word blacklists | Adds significant state management and UI surface. Not a differentiator for a viewer-facing extension. | Defer. Can be a settings phase. |
| Animated emote playback in the chat list | APNG/WebP animated emotes from 7TV/BTTV degrade scroll performance significantly at scale. Extension context makes this worse. | Static image thumbnails only for now. |
| Native platform feature parity (polls, predictions, channel points) | Each platform has unique interactive features. Replicating them couples the extension tightly to platform DOM changes. | Focus on message stream only. |

---

## Feature Dependencies

```
Kick detection and injection
  → requires: kick.ts content script (mirrors twitch.ts structure)
  → requires: manifest.json host permissions for kick.com
  → requires: Kick streamer username extraction from kick.com URL

YouTube complete chat replacement
  → requires: robust YouTube live detection (current brittle selectors need hardening)
  → requires: YouTube username extraction fix (currently fragile, see CONCERNS.md)
  → requires: iframe slot mounting in YouTube's chat DOM slot (not fixed overlay)

Iframe DOM-slot mounting (all platforms)
  → requires: per-platform injection point selector research
  → requires: collapse/resize to work via CSS in the slot (not fixed position offsets)
  → unlocks: resizable panel (container geometry is platform-managed, not hard-coded)

Resizable panel
  → requires: iframe slot mounting (fixed-position container has no meaningful resize story)
  → requires: postMessage protocol for width/height to propagate from UI to container div

Design system migration
  → requires: OkLCh token CSS variables scoped to iframe :root
  → requires: Tailwind config updated to reference custom tokens (not gray-* palette)
  → requires: InfinityLogo SVG asset bundled in chat-bundle

Error boundary
  → requires: React ErrorBoundary wrapper around ChatContainer
  → no upstream dependency; can be done standalone

Emote cache persistence
  → requires: emote data stored in service worker (not component state)
  → requires: cache invalidation on streamer change

LLM-agent testing
  → requires: existing Playwright setup (already in place)
  → requires: AI agent SDK integration (Stagehand or similar)
  → requires: test fixtures that stub WebSocket messages
```

---

## MVP Recommendation for This Milestone

This is a milestone (not greenfield), so "MVP" means what must ship to call the milestone done.

**Must ship:**
1. Design system applied — OkLCh tokens, InfinityLogo, Inter/DM Mono (visual contract with all-chat)
2. YouTube chat complete replacement — detection + injection + message rendering
3. Kick platform support — detection + injection + message rendering
4. Iframe DOM-slot mounting on all three platforms (eliminates the fixed overlay)
5. Error boundary on ChatContainer (zero-cost safety net)
6. LLM-agent testing infrastructure (Playwright + agent, at least one scenario per platform)

**Defer from this milestone:**
- Resizable panel: Depends on slot mounting being stable first; avoid shipping both at once
- Emote cache persistence: Valuable but not blocking; defer to next milestone
- Popup full redesign: Low risk to defer; functional popup is acceptable
- Multi-stream support: Architectural change, separate milestone

---

## LLM-Agent Testing Section

### What Playwright Alone Cannot Test

Conventional Playwright tests are selector-anchored. When Twitch deploys a class rename or YouTube restructures its DOM, tests fail for the wrong reason (selector mismatch, not a real regression). An LLM-agent-driven test layer addresses this.

| Behavior | Why Playwright Alone Fails | What LLM Agent Does Better |
|----------|---------------------------|---------------------------|
| "Chat panel is visible and populated" | Selector for chat container may change across platform deploys | Agent visually confirms panel is present and contains message text — no selector dependency |
| "User can type and send a message" | Input selectors brittle; chat send flow involves multi-layer postMessage | Agent acts as a user: finds input by visual/semantic context, types, submits, verifies feedback |
| "Connection failure state is communicated clearly" | Requires injecting a disconnected WS state and asserting UI copy — hard to express as selectors | Agent reads error state text and verifies it is actionable English |
| "Platform indicator is correct" | Would require knowing the exact DOM structure of the platform badge | Agent reads the platform label in context |
| "Emote renders as image not raw text" | Requires knowing image element selectors and emote alt text | Agent verifies that text containing `:Kappa:` produces a visible image, not literal text |
| "Collapse/expand works" | Toggle selector + measuring container dimensions — fragile | Agent verifies that after clicking the toggle, the chat area disappears/reappears visually |
| "Design system looks correct (not broken colors)" | Not testable with Playwright assertions at all | Agent can compare screenshots and identify obvious color/typography regressions |

### What LLM-Agent Tests Are NOT Good For

- Precise pixel measurements (wrong tool)
- Performance benchmarks (wrong tool)
- Replacing unit tests on pure logic (wrong tool, high cost)
- Testing message throughput under load (wrong tool)

Use LLM agents for behavioral and visual correctness at the user-perception layer. Keep Playwright selectors for mechanical flow tests that have stable anchors.

### Recommended Test Scenarios for This Milestone

| Scenario | Platform | Behavior Verified |
|----------|----------|-------------------|
| Extension loads on a live stream | Twitch | Chat panel appears, shows "Waiting for messages…" or messages |
| Extension loads on a live stream | YouTube | Chat panel replaces native YouTube chat |
| Extension loads on a live stream | Kick | Chat panel replaces native Kick chat |
| User sends a message | Twitch | Input visible, accepts text, send completes with feedback toast |
| Connection failure shown | All | After WS failure injected, error state communicated clearly to user |
| Collapse and expand chat | Twitch | Toggle hides and restores chat body |
| Emote renders as image | Twitch | A known emote word renders as an `<img>`, not raw text |
| Platform indicator correct | YouTube | Message list shows YouTube platform label |

### Tooling Recommendation

Use **Stagehand** (Browserbase SDK, open-source, built on Playwright) — it wraps Playwright with an `act()` / `extract()` / `observe()` interface that sends screenshots to an LLM for semantic interpretation.

**Confidence: MEDIUM.** Stagehand was the dominant open-source option as of August 2025. Verify current version and API before implementation. The alternative is direct Playwright + screenshot + Claude API calls in test helpers — higher implementation cost but no additional dependency.

Key constraint: extension testing requires non-headless Chrome (already the case per `playwright.config.ts`). Stagehand supports this mode. LLM API calls from tests require an API key in the test environment — treat this as a CI secret, not a committed value.

### Test Infrastructure Shape

```
tests/
  agent/
    twitch-chat-visibility.spec.ts    # Agent: chat panel visible on live stream
    youtube-chat-replacement.spec.ts  # Agent: native chat replaced
    kick-chat-injection.spec.ts       # Agent: Kick injection works
    send-message-flow.spec.ts         # Agent: user can type and send
    connection-failure-ui.spec.ts     # Agent: error state is legible
  fixtures/
    ws-mock.ts                        # Stubs WebSocket messages for deterministic tests
    extension-helper.ts               # Loads unpacked extension, navigates to stream URL
```

Agent tests live in `tests/agent/` alongside existing selector-based specs in `tests/`. They run in the same Playwright worker pool but are tagged (`@agent`) so they can be excluded from fast local runs and reserved for CI or pre-release.

---

## Sources

- Codebase files read: `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/TESTING.md`, `.planning/codebase/ARCHITECTURE.md`, `src/ui/components/ChatContainer.tsx`, `src/content-scripts/twitch.ts`
- Training knowledge on: BetterTTV, FrankerFaceZ, 7TV Chrome extensions; Chatterino desktop client; Stagehand (Browserbase); Playwright extension testing patterns; Chrome MV3 constraints
- Web search was unavailable — all ecosystem claims are training-data derived (cutoff August 2025). Verify Stagehand current API before committing to it.
