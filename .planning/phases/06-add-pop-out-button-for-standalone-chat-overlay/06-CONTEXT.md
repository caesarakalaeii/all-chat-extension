# Phase 6: Add Pop-Out Button for Standalone Chat Overlay - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a pop-out button to the AllChat header that opens the chat in a standalone browser window, detached from the streaming page. Additionally, inject a "Switch to AllChat" button into each platform's native pop-out chat, and provide a "Switch to native" button in AllChat (both in-page and pop-out) for bidirectional switching between AllChat and native chat.

</domain>

<decisions>
## Implementation Decisions

### Button Placement & Icon
- **D-01:** Pop-out button placed as the rightmost element in the AllChat chat header, after the connection dot and platform badge.
- **D-02:** Icon is an external link arrow (⇗) — universally recognized as "open in new window."
- **D-03:** A "Switch to native" button is also placed in the AllChat header bar (both in-page and pop-out) to allow switching back to native platform chat.

### Window Behavior
- **D-04:** Pop-out window opens via `window.open()` from the content script. No extra manifest permissions needed. Content scripts already use this pattern for OAuth.
- **D-05:** When chat is popped out, the in-page AllChat iframe is replaced with a "Chat popped out" indicator banner with a button to bring it back.
- **D-06:** Pop-out window is a normal window (no always-on-top). Standard window behavior.
- **D-07:** Pop-out window size and position are persisted in `chrome.storage.local` and restored on next pop-out.

### Chat State Continuity
- **D-08:** Existing message history is transferred to the pop-out window so it starts with the full message buffer visible.
- **D-09:** Pop-out window creates a new connection via the service worker (loads `chat-container.html` which connects through the existing service worker WebSocket management).
- **D-10:** Closing the pop-out window automatically restores the in-page AllChat chat iframe.

### Native Chat Switch Button
- **D-11:** A "Switch to AllChat" button (AllChat branded with InfinityLogo) is injected into the native pop-out chat on Twitch, YouTube, and Kick.
- **D-12:** Clicking "Switch to AllChat" replaces the native chat content in the same pop-out window with AllChat's `chat-container.html`.
- **D-13:** Clicking "Switch to native" in the AllChat pop-out navigates back to the platform's native chat in the same window.
- **D-14:** "Switch to native" in the in-page AllChat removes/hides AllChat and restores the platform's native chat. A "Switch to AllChat" button appears in the native chat to switch back.

### Scope & Platforms
- **D-15:** Pop-out button in AllChat header available on all four platforms: Twitch, YouTube, YouTube Studio, Kick.
- **D-16:** "Switch to AllChat" button in native pop-out chat available on Twitch, YouTube, and Kick (research needed for Kick's native pop-out support).
- **D-17:** If a platform is disabled via per-site toggle, AllChat doesn't inject at all, so neither the pop-out button nor the "Switch to AllChat" button appear. No special handling needed.

### Claude's Discretion
- Implementation of "Switch to native" in-page: whether to hide (keep running) or remove (destroy) the AllChat iframe when switching to native. Claude picks best approach based on performance and UX tradeoffs.
- Exact styling of the "Chat popped out" indicator banner
- Default pop-out window dimensions (before any persisted size exists)
- How to serialize and transfer message history to the pop-out window (postMessage, URL params, storage, etc.)
- How to detect the native pop-out chat window on each platform for "Switch to AllChat" button injection

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Chat UI
- `src/ui/components/ChatContainer.tsx` — Main chat component with header layout (collapse button, InfinityLogo, connection dot, platform badge). Pop-out button goes here.
- `src/ui/chat-container.html` — HTML shell loaded in iframe and pop-out window
- `src/ui/components/InfinityLogo.tsx` — Logo component to use in "Switch to AllChat" branding

### Content Scripts
- `src/content-scripts/twitch.ts` — Twitch injection, handles pop-out trigger, `window.open` pattern used for OAuth
- `src/content-scripts/youtube.ts` — YouTube injection, theater mode handling
- `src/content-scripts/youtube-studio.ts` — YouTube Studio injection
- `src/content-scripts/kick.ts` — Kick injection
- `src/content-scripts/base/PlatformDetector.ts` — Base class for all content scripts

### Storage & Types
- `src/lib/types/extension.ts` — Storage types (`SyncStorage`, `LocalStorage`) — pop-out window dimensions will be stored here
- `src/lib/storage.ts` — Chrome storage API wrappers

### Service Worker
- `src/background/service-worker.ts` — WebSocket management, broadcasts to all tabs. Pop-out window connects through this.

### Design System
- `src/ui/styles.css` — OkLCh design tokens for consistent styling

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `window.open()` pattern already used in content scripts for OAuth (`width=600,height=700,left=100,top=100`)
- `chat-container.html` already works as a standalone page (loads React app + styles)
- Service worker already broadcasts to all tabs — pop-out window will receive messages automatically
- `chrome.storage.local` already used for UI state (`ui_collapsed`) — same pattern for window dimensions
- `InfinityLogo` component ready for "Switch to AllChat" button branding
- `PlatformDetector` base class has `createInjectionPoint()` and `teardown()` — useful for show/hide native chat

### Established Patterns
- Header layout: `px-2 py-1.5 bg-surface border-b border-border flex items-center`
- Button style: `text-[var(--color-text-dim)] hover:text-text transition-colors`
- Content scripts communicate via `chrome.runtime.sendMessage` to service worker
- iframe uses `postMessage` for content script ↔ UI communication

### Integration Points
- Chat header in `ChatContainer.tsx` — add pop-out button and "switch to native" button
- Each content script — handle pop-out window lifecycle, "popped out" indicator, native chat show/hide
- Each platform's native pop-out chat DOM — inject "Switch to AllChat" button
- `LocalStorage` type — add `popout_window_width`, `popout_window_height`, `popout_window_x`, `popout_window_y`

</code_context>

<specifics>
## Specific Ideas

- **Loukas discovery:** Native platform chat pop-out already works, so the "Switch to AllChat" button in native pop-out is a proven path (devnamedloukas confirmed this works on Twitch)
- **Truffle reference:** The "Switch to AllChat" button concept is inspired by Truffle's similar feature that let users switch between chat providers in pop-out windows
- **Bidirectional switching:** Users should be able to freely switch between AllChat and native chat in both directions — in-page and in pop-out windows

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-add-pop-out-button-for-standalone-chat-overlay*
*Context gathered: 2026-04-07*
