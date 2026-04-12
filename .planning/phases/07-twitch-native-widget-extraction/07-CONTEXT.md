# Phase 7: Twitch Native Widget Extraction - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract native Twitch interactive widgets (channel points, predictions, polls, hype trains, raids) from the hidden native chat DOM and surface them alongside the AllChat iframe, preserving full interactivity. Replace the current small "switch to native" button with a tab bar (`[∞ AllChat] | [Twitch Chat]`) that replaces the AllChat header. When on the AllChat tab, widgets appear in their native positions (top zone and bottom zone) around the iframe. When on the Twitch Chat tab, full native chat is restored. Twitch only — YouTube and Kick widget extraction is deferred to a future phase.

</domain>

<decisions>
## Implementation Decisions

### Widget Placement
- **D-01:** Widgets are positioned to match their native Twitch locations — predictions/polls/hype trains at the top of chat, channel points at the bottom.
- **D-02:** Two widget zones are created by the content script: a top zone (above the iframe, for predictions/polls/hype trains) and a bottom zone (below the iframe, for channel points). The iframe flexes between them.
- **D-03:** Widget zones are only visible when the AllChat tab is active. When Twitch Chat tab is active, native chat is fully restored (full swap).

### Tab Bar Design
- **D-04:** Tab bar replaces the AllChat iframe header entirely. InfinityLogo moves into the AllChat tab label (`[∞ AllChat] | [Twitch Chat]`).
- **D-05:** Tab bar is styled with the AllChat design system (OkLCh tokens, Inter font) — not Twitch's native styling.
- **D-06:** Tab bar is injected by the content script, outside the iframe. It controls visibility of both views.
- **D-07:** Full swap on tab switch: clicking Twitch Chat hides the AllChat iframe + widget zones and fully restores native Twitch chat. Clicking AllChat reverses. Tab bar persists at top regardless of active view.
- **D-08:** This replaces the existing "Switch to native" button in both the content script overlay and the ChatContainer header. The Phase 6 `handleSwitchToNative()` / `handleSwitchToAllChat()` infrastructure is refactored into the tab bar.

### Extraction Method
- **D-09:** Clone + event forwarding approach. Widgets are deep-cloned (`cloneNode(true)`) from the hidden native chat DOM into the AllChat widget zones.
- **D-10:** MutationObserver on the original widget nodes keeps clones visually in sync (attribute changes, child mutations).
- **D-11:** Click events on cloned widgets are intercepted and programmatically dispatched (`dispatchEvent()`) on the corresponding original hidden element, preserving full interactivity.
- **D-12:** Native chat remains hidden via the existing CSS `<style>` tag approach (`visibility: hidden + height: 0`). Original widgets stay in React's tree — undisturbed by the cloning.

### Widget Scope
- **D-13:** All major Twitch interactive widgets are in scope: channel points (balance, claim bonus, redemptions), predictions, polls, hype trains, and raid banners.
- **D-14:** Dynamic widget detection via MutationObserver on the native chat container. When a prediction/poll/hype train appears in the native DOM, it is automatically cloned into the appropriate widget zone. When the original disappears, the clone is removed.
- **D-15:** Channel points widget is persistent (always visible for logged-in viewers) — cloned once on initialization and kept in sync.
- **D-16:** Predictions, polls, hype trains, and raids are transient — cloned on appearance, removed on disappearance.

### Folded Todos
- **Tab bar switcher** (from `.planning/todos/pending/tab-bar-switcher.md`): Replace the small "go back to native" button with a persistent tab bar `[AllChat] | [Twitch Chat]`. Folded into this phase as D-04 through D-08.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Content Scripts
- `src/content-scripts/twitch.ts` — Twitch injection, native chat hiding (`#allchat-hide-native-style`), MutationObserver patterns, `handleSwitchToNative()` / `handleSwitchToAllChat()`
- `src/content-scripts/base/PlatformDetector.ts` — Base class with `hideNativeChat()`, `showNativeChat()`, `teardown()`, switch handlers

### Chat UI
- `src/ui/components/ChatContainer.tsx` — Current header layout with InfinityLogo, connection dot, platform badge, "Native" button, pop-out button. Tab bar replaces this header.
- `src/ui/components/InfinityLogo.tsx` — Logo component for tab label branding
- `src/ui/styles.css` — OkLCh design tokens for tab bar styling

### Research
- `.planning/notes/native-injection-research.md` — Research findings on 7TV/BTTV/FFZ injection approaches, "additive not subtractive" design principle

### Types & Storage
- `src/lib/types/extension.ts` — Extension message types, storage types

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PlatformDetector.handleSwitchToNative()` / `handleSwitchToAllChat()` — existing toggle infrastructure to refactor into tab bar
- `#allchat-hide-native-style` CSS injection — existing native chat hiding, widgets stay in DOM
- MutationObserver pattern on `.chat-shell` parent — scoped observation, already established
- `#allchat-container` with `position: absolute; inset: 0` inside `.chat-shell` — flex layout to accommodate widget zones
- AllChat design tokens in `styles.css` — ready for tab bar styling

### Established Patterns
- Content script injects DOM elements into `.chat-shell` (Phase 1 pattern)
- `postMessage` for iframe ↔ content script communication
- `chrome.runtime.sendMessage` for service worker communication
- CSS `<style>` tag injection with unique IDs for native chat hiding

### Integration Points
- `twitch.ts` — Main integration point: tab bar injection, widget zone creation, clone management, event forwarding
- `PlatformDetector` — Refactor switch handlers into tab bar toggle
- `ChatContainer.tsx` — Remove/modify header since tab bar replaces it (content script sends message to iframe indicating tab bar mode)
- `.chat-shell` — Container for tab bar + widget zones + iframe layout

</code_context>

<specifics>
## Specific Ideas

- **"Additive, never subtractive"** design principle — users should gain cross-platform aggregation without losing any native platform functionality
- The tab bar label uses InfinityLogo inline: `[∞ AllChat]` — maintaining brand identity
- Event forwarding from clones to originals is the key technical challenge — needs robust element mapping between clone and original trees
- Widget selectors will need live verification against current Twitch DOM before implementation (similar to Phase 3 Kick selector verification)

</specifics>

<deferred>
## Deferred Ideas

- **YouTube widget extraction** — Super Chat highlights, membership badges, polls (seeded in `.planning/seeds/youtube-kick-native-widgets.md`)
- **Kick widget extraction** — Sub gifting, polls, slow mode indicators (same seed)
- **Tab bar on YouTube/Kick** — Extend the tab bar pattern to other platforms (natural extension when their widget extraction phases happen)

</deferred>

---

*Phase: 07-twitch-native-widget-extraction*
*Context gathered: 2026-04-12*
