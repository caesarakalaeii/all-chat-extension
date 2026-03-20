# Phase 1: DOM Slot Injection - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the fixed-position overlay injection with native DOM slot injection on Twitch and YouTube. Remove hardcoded init delays, extract `waitForElement()` to the `PlatformDetector` base class, scope MutationObservers to the relevant slot parent, and fix YouTube SPA navigation to use `yt-navigate-finish`. No new platforms, no design system changes — injection architecture only.

</domain>

<decisions>
## Implementation Decisions

### waitForElement() utility
- Extracted to `PlatformDetector` base class (INJ-07)
- Pre-delay before first check: ~200ms (gives SPA time for initial render)
- Poll interval: 100ms (checks 10x/sec — fast enough to feel instant, low CPU)
- Timeout: 10 seconds before giving up
- On timeout: do nothing (show native chat by default) + emit `console.warn` — no user-visible badge or indicator

### Slot not found — fallback behavior
- If slot not found after timeout: native chat remains visible, `console.warn` is emitted
- No silent fallback to `document.body` append (INJ-02) — that code path is fully removed

### Twitch slot targeting
- `waitForElement('.chat-shell')` only — no fallback selector chain (INJ-01, INJ-02)
- Wrapper div + iframe both sized `width: 100%; height: 100%` — trust `.chat-shell` to control dimensions, no hardcoded pixel values
- Still inject `<style>` tag to hide native Twitch chat elements inside the slot (belt-and-suspenders — Twitch may render native elements alongside the iframe)
- MutationObserver scoped to `.chat-shell`'s **parent** (`childList: true, subtree: false`) — detects if `.chat-shell` itself is removed; if so, re-run `waitForElement()` (INJ-03)
- Observer is stopped and restarted on each Twitch navigation (re-scoped to the new slot parent)

### YouTube slot targeting
- Hide `ytd-live-chat-frame` via an injected `<style>` tag (not inline style) so Polymer recreation on navigation doesn't restore it (INJ-06)
- Insert `#allchat-container` in the same flex slot — before `ytd-live-chat-frame` in the DOM tree
- Same `waitForElement()` path as Twitch (200ms pre-delay, 100ms poll, 10s timeout)

### YouTube SPA navigation
- Primary: `yt-navigate-finish` event on `window`
- Fallback: `popstate` event — whichever fires first triggers the re-initialization check (INJ-05)
- Listener registered once on `initialize()` — not re-registered after each navigation
- After each navigation: always call `isLiveStream()` to check current page state
  - If live: run `waitForElement()` with the standard pre-delay path
  - If not live: run `teardown()` if we had previously injected

### Cleanup on SPA navigation (both platforms)
- Full teardown before reinitializing: remove `#allchat-container`, remove injected `<style>` tags, call `showNativeChat()`
- `teardown()` is a shared method on `PlatformDetector` base class; platforms can override for extra cleanup
- Teardown fires **immediately on URL change** — before the new page loads, not after

### Claude's Discretion
- Exact `waitForElement()` implementation (Promise, callback, or generator)
- Whether to use a single shared `<style>` id or per-feature ids for Twitch hide styles
- Handling of edge cases where `.chat-shell` parent element is not accessible

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PlatformDetector.findChatContainer()` (`src/content-scripts/base/PlatformDetector.ts`): existing selector-based element finder — `waitForElement()` will complement this (polling variant)
- `TwitchDetector.hideNativeChat()`: already uses `<style>` tag injection with `id="allchat-hide-native-style"` — keep this pattern, extend for YouTube
- `PlatformDetector.injectAllChatUI()`: already sets `data-platform` and `data-streamer` attributes on the iframe — these are needed for Phase 4 `frameLocator`

### Established Patterns
- `chrome.runtime.sendMessage` for service worker communication — all async, no persistent background page
- `postMessage` with `*` origin for iframe ↔ content script relay — preserved in this phase
- `document.getElementById('allchat-container')` used throughout for container lookup — keep this id

### Integration Points
- `PlatformDetector` base class (`src/content-scripts/base/PlatformDetector.ts`): `waitForElement()` and `teardown()` added here
- `twitch.ts` `setupMutationObserver()`: replace `document.body` subtree observer with scoped `.chat-shell` parent observer
- `youtube.ts` `setupUrlWatcher()`: replace MutationObserver URL polling with `yt-navigate-finish` + `popstate` listeners
- `twitch.ts` `setupUrlWatcher()`: still uses MutationObserver on `document` — can be simplified or kept as-is (Twitch doesn't have a custom navigate event)

### Code to Remove
- `TWITCH_INIT_DELAY = 1000` and `YOUTUBE_INIT_DELAY = 2000` constants — replaced by `waitForElement()` pre-delay (INJ-08)
- `TwitchDetector.createInjectionPoint()` fixed-position body append (`document.body.appendChild(container)` with `position: fixed` CSS) — fully removed (INJ-02)
- `YouTubeDetector.hideNativeChat()` inline style approach — replaced by `<style>` tag injection (INJ-06)

</code_context>

<specifics>
## Specific Ideas

- No specific visual references mentioned — this is infrastructure, not UI
- The 200ms pre-delay was chosen to give SPA frameworks time for initial render without the 1–2 second waste of the current hardcoded constants

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-dom-slot-injection*
*Context gathered: 2026-03-12*
