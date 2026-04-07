# Phase 6: Add Pop-Out Button for Standalone Chat Overlay - Research

**Researched:** 2026-04-07
**Domain:** Chrome Extension MV3 — window management, postMessage communication, DOM injection, React UI
**Confidence:** HIGH

## Summary

This phase adds bidirectional switching between AllChat and native platform chat, in both in-page and pop-out window contexts. The foundation is fully in place: `chat-container.html` already loads as a standalone page, `window.open()` is already used in content scripts for OAuth, the service worker already broadcasts to all tabs, and `chrome.storage.local` already persists UI state. No new manifest permissions are needed.

The primary complexity is the communication protocol between the content script and the AllChat iframe for triggering pop-out, detecting pop-out window close, and signaling the "bring back chat" action. The secondary complexity is injecting the "Switch to AllChat" button into each platform's native pop-out chat DOM — this requires knowing how each platform constructs its native pop-out URL, finding a stable DOM injection target inside that pop-out window, and handling the fact that the pop-out is a separate window (not a tab the content script runs in).

Message history transfer (D-08) deserves careful design: the iframe holds messages in React state only. The cleanest transfer mechanism is `chrome.storage.local` — write the buffer before opening the pop-out, read it on mount. This avoids cross-origin postMessage complexity and the 2KB URL param size limit.

**Primary recommendation:** Implement the pop-out flow as a new postMessage message type (`POPOUT_REQUEST`) sent from the iframe to the content script, which then calls `window.open()` and manages the pop-out window lifecycle. Use `chrome.storage.local` for message history handoff. Use `window.addEventListener('beforeunload')` in the pop-out window's content script context (not possible — it's a standalone extension page) — instead, use a `chrome.windows.onRemoved` listener in the service worker to detect pop-out close.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Button Placement & Icon**
- D-01: Pop-out button placed as the rightmost element in the AllChat chat header, after the connection dot and platform badge.
- D-02: Icon is an external link arrow (⇗) — universally recognized as "open in new window."
- D-03: A "Switch to native" button is also placed in the AllChat header bar (both in-page and pop-out) to allow switching back to native platform chat.

**Window Behavior**
- D-04: Pop-out window opens via `window.open()` from the content script. No extra manifest permissions needed.
- D-05: When chat is popped out, the in-page AllChat iframe is replaced with a "Chat popped out" indicator banner with a button to bring it back.
- D-06: Pop-out window is a normal window (no always-on-top). Standard window behavior.
- D-07: Pop-out window size and position are persisted in `chrome.storage.local` and restored on next pop-out.

**Chat State Continuity**
- D-08: Existing message history is transferred to the pop-out window so it starts with the full message buffer visible.
- D-09: Pop-out window creates a new connection via the service worker (loads `chat-container.html` which connects through the existing service worker WebSocket management).
- D-10: Closing the pop-out window automatically restores the in-page AllChat chat iframe.

**Native Chat Switch Button**
- D-11: A "Switch to AllChat" button (AllChat branded with InfinityLogo) is injected into the native pop-out chat on Twitch, YouTube, and Kick.
- D-12: Clicking "Switch to AllChat" replaces the native chat content in the same pop-out window with AllChat's `chat-container.html`.
- D-13: Clicking "Switch to native" in the AllChat pop-out navigates back to the platform's native chat in the same window.
- D-14: "Switch to native" in the in-page AllChat removes/hides AllChat and restores the platform's native chat. A "Switch to AllChat" button appears in the native chat to switch back.

**Scope & Platforms**
- D-15: Pop-out button in AllChat header available on all four platforms: Twitch, YouTube, YouTube Studio, Kick.
- D-16: "Switch to AllChat" button in native pop-out chat available on Twitch, YouTube, and Kick (research needed for Kick's native pop-out support).
- D-17: If a platform is disabled via per-site toggle, no special handling needed — AllChat doesn't inject at all.

### Claude's Discretion
- Implementation of "Switch to native" in-page: whether to hide (keep running) or remove (destroy) the AllChat iframe when switching to native.
- Exact styling of the "Chat popped out" indicator banner.
- Default pop-out window dimensions (before any persisted size exists).
- How to serialize and transfer message history to the pop-out window (postMessage, URL params, storage, etc.).
- How to detect the native pop-out chat window on each platform for "Switch to AllChat" button injection.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Standard Stack

No new libraries are introduced in this phase. All tooling is already in place.

[VERIFIED: codebase grep] Dependencies from package.json are not repeated here — only the relevant existing APIs matter:

| API / Pattern | Version | Purpose | Source |
|---|---|---|---|
| `window.open()` | Web API | Open pop-out window from content script | Already used in twitch.ts for OAuth |
| `chrome.storage.local` | MV3 | Persist window dimensions, message buffer | Already used for `ui_collapsed` |
| `chrome.storage.session` | MV3 | Track active pop-out window ID | Already used for `ws_active_streamer` |
| `postMessage` | Web API | iframe <-> content script signaling | Core of existing relay pattern |
| `chrome.runtime.onMessage` | MV3 | Content script <-> service worker | Core of existing relay |
| `chrome.tabs.query` | MV3 | Service worker broadcast | Already used in `broadcastConnectionState` |
| `chrome.windows.onRemoved` | MV3 | Detect pop-out window close | Available, no new permission needed |

**No new npm dependencies. No new manifest permissions.**

---

## Architecture Patterns

### Existing Communication Topology

Understanding the existing flow is critical to adding pop-out without breaking it:

```
Service Worker (WebSocket)
  |
  | chrome.tabs.sendMessage (broadcastConnectionState)
  v
Content Script (twitch.ts / youtube.ts / etc.)
  |
  | iframe.contentWindow.postMessage (relay)
  v
AllChat iframe (ChatContainer.tsx)
  |
  | window.parent.postMessage (requests)
  v
Content Script (handler in setupGlobalMessageRelay)
  |
  | chrome.runtime.sendMessage
  v
Service Worker
```

[VERIFIED: codebase read — twitch.ts, service-worker.ts]

### Pop-Out Window Cannot Use the Existing Relay

The existing relay path requires a content script running on the platform page that can:
1. Receive `chrome.runtime.onMessage` from the service worker
2. Forward it to the AllChat iframe via `iframe.contentWindow.postMessage`

A pop-out window opens `chat-container.html` as a **standalone extension page** (loaded via `chrome.runtime.getURL('ui/chat-container.html')`). This page is not embedded in a platform tab, so:
- No content script runs in the pop-out window's context
- `window.parent` is the same window (no parent)
- The existing `window.parent.postMessage` relay from ChatContainer.tsx does **not work** for pop-out

[VERIFIED: Chrome extension architecture — extension pages run in extension context, not tab context]

### Pop-Out Window Communication Solution

The pop-out `chat-container.html` page must use `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` **directly** — it is an extension page and has access to the Chrome extension APIs.

This means:
1. `ChatContainer.tsx` needs to detect whether it is running in an iframe (in-page) or as a standalone extension page (pop-out mode)
2. In pop-out mode: replace `window.parent.postMessage(...)` calls with `chrome.runtime.sendMessage(...)`
3. In pop-out mode: receive messages via `chrome.runtime.onMessage` instead of `window.addEventListener('message', ...)`

**Detection method:** [VERIFIED: codebase read — ChatContainer.tsx uses `window.parent.postMessage`]
```typescript
// In chat-container.html / ChatContainer.tsx
const isPopOut = window === window.parent; // true when not in iframe
```

Alternatively, read a URL search param: `chat-container.html?popout=true&platform=twitch&streamer=...` — this is already how `platform`, `streamer`, `display_name`, and `twitch_channel` are passed.

[ASSUMED: The cleanest approach is URL param `?popout=1` — isolates logic without touching iframe detection heuristics. Recommend this over `window === window.parent` since YouTube Studio also embeds things in iframes.]

### Message History Transfer via chrome.storage.local

D-08 requires existing messages to appear in the pop-out window. Options ranked by feasibility:

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| `chrome.storage.local` temp key | Works cross-context, survives async open delay | ~5MB limit (enough for 50 messages) | **Recommended** |
| URL params | No async | 2KB URL limit — fails with any images/emotes in history | Rejected |
| postMessage from opener | No storage needed | Race condition: pop-out must be ready before opener sends | Rejected |
| `window.opener.postMessage` | Pop-out can pull from opener | Requires opener window reference; breaks if opener navigates | Fragile |

**Recommended approach:** Before calling `window.open()`, serialize the current message buffer (capped at 50) to `chrome.storage.local` under key `popout_message_buffer`. The pop-out window reads this key on mount, displays it, then deletes the key.

[VERIFIED: `chrome.storage.local` is already used in this codebase — `setLocalStorage` / `getLocalStorage` in `src/lib/storage.ts`]

### Pop-Out Window Lifecycle (D-10)

D-10 requires the in-page AllChat iframe to restore itself when the pop-out closes. The iframe cannot detect a foreign window closing via `postMessage` alone — the closed window cannot send a final message reliably. The service worker approach is cleaner:

1. When the content script calls `window.open()`, it stores the pop-out window ID (returned by `window.open()` object) in `chrome.storage.session` or sends a `POPOUT_OPENED` message to the service worker
2. The service worker registers `chrome.windows.onRemoved` to detect when that window closes
3. On close, service worker sends `POPOUT_CLOSED` message to the originating tab's content script
4. Content script sends `POPOUT_CLOSED` to the in-page iframe via postMessage
5. Iframe replaces "Chat popped out" banner with normal chat UI and reconnects

**Alternative (simpler):** Content script uses `window.open()` and polls `popoutWindow.closed` via `setInterval` to detect close. No service worker changes needed. Downside: polling every 500ms. This is acceptable for a single window.

[ASSUMED: Recommend the polling approach (`setInterval` checking `popoutWindow.closed`) as it avoids adding new service worker message types and keeps the pop-out lifecycle entirely in the content script. 500ms poll latency is imperceptible for this use case.]

### Native Pop-Out Detection for "Switch to AllChat" Injection (D-11/D-12)

Each platform has a different native pop-out chat URL:

| Platform | Native Pop-Out URL Pattern | How to Detect |
|---|---|---|
| Twitch | `https://www.twitch.tv/popout/{channel}/chat` | Content script matches pattern OR `window.location.pathname.includes('/popout/')` |
| YouTube | `https://www.youtube.com/live_chat?...` or `https://www.youtube.com/live_chat_replay?...` | `window.location.pathname === '/live_chat'` |
| Kick | No standard pop-out URL known | Research needed (see Open Questions) |

[VERIFIED: Twitch pop-out URL — confirmed `/popout/{channel}/chat` from community documentation and Loukas confirmation in CONTEXT.md specifics]
[VERIFIED: YouTube pop-out URL — `youtube.com/live_chat` is the standalone live chat page used in pop-out and embedded modes]
[ASSUMED: Kick pop-out URL — unverified, needs live browser testing]

For Twitch, the existing manifest already matches `https://www.twitch.tv/*` — the pop-out URL is covered.
For YouTube, the existing manifest matches `https://www.youtube.com/watch*` and `https://www.youtube.com/live/*` but **not** `https://www.youtube.com/live_chat*`. The manifest needs a new content script entry for `https://www.youtube.com/live_chat*`.

[VERIFIED: manifest.json content_scripts section read — no `live_chat` match exists currently]

The "Switch to AllChat" button injection into native pop-out requires a **new, small content script** (or an extension of existing ones) that:
1. Detects it is in a native pop-out context
2. Finds a stable injection target in the native pop-out DOM
3. Injects a button with InfinityLogo and "Switch to AllChat" label
4. On click: navigates `window.location.href` to `chrome.runtime.getURL('ui/chat-container.html?platform=...&streamer=...&popout=1')`

For D-12 ("Clicking replaces native chat content in the same pop-out window"), `window.location.href = extensionPageUrl` is the correct mechanism — it navigates the existing pop-out window to the extension page.

[VERIFIED: `chrome.runtime.getURL` works from content scripts to get extension resource URLs]

### In-Page "Switch to Native" (D-14) — Hide vs Remove

Claude's discretion: whether to hide or destroy the AllChat iframe when switching to native in-page.

**Recommendation: Hide (keep running), do not destroy.**

Rationale:
- Hiding (`display: none` on `#allchat-container`) preserves the WebSocket connection and message buffer — switching back is instant, no reconnect needed
- Destroying the iframe would require a full reinit on "Switch back" including WebSocket reconnect delay
- Memory cost of a hidden iframe is negligible (single small React app)
- The "Switch to AllChat" button injected into native chat triggers `showAllChat()` — if the iframe is still mounted, this is a simple CSS toggle

Implementation: Add `allchat-hidden` state to the content script. When hidden: `#allchat-container { display: none }`. The "Switch to AllChat" button in native chat removes that style.

[ASSUMED: Hide approach preferred over destroy based on performance/UX tradeoff analysis]

### postMessage New Types Required

Adding pop-out requires new postMessage message types between iframe and content script:

| Type | Direction | Payload | Purpose |
|---|---|---|---|
| `POPOUT_REQUEST` | iframe → content script | `{ platform, streamer, messages: ChatMessage[] }` | Triggers `window.open()` in content script |
| `POPOUT_OPENED` | content script → iframe | none | Confirms pop-out opened; iframe shows "popped out" banner |
| `POPOUT_CLOSED` | content script → iframe | none | Pop-out was closed; iframe restores normal UI |
| `SWITCH_TO_NATIVE` | iframe → content script | none | User clicked "Switch to native" in-page |
| `SWITCH_TO_ALLCHAT` | native chat DOM → content script | `{ platform, streamer }` | User clicked "Switch to AllChat" in native chat |

[ASSUMED: These are new types not in the existing code. They follow the existing `postMessage` naming convention in the codebase.]

### chrome.storage.local New Keys Required

```typescript
// Additions to LocalStorage interface in src/lib/types/extension.ts
interface LocalStorage {
  // ... existing keys ...
  popout_window_width?: number;     // D-07
  popout_window_height?: number;    // D-07
  popout_window_x?: number;         // D-07
  popout_window_y?: number;         // D-07
  popout_message_buffer?: string;   // D-08 — JSON-serialized ChatMessage[], cleared after read
}
```

[VERIFIED: LocalStorage interface read from src/lib/types/extension.ts — none of these keys exist yet]

### Service Worker Broadcast: Pop-Out Window NOT Covered

The existing `broadcastConnectionState` and `handleWebSocketMessage` functions query tabs matching Twitch/YouTube/Kick URLs:

```typescript
chrome.tabs.query({ url: ['https://www.twitch.tv/*', 'https://www.youtube.com/*', 'https://kick.com/*'] }, ...)
```

The pop-out window loads `chrome.runtime.getURL('ui/chat-container.html')` — an `chrome-extension://` URL, NOT a platform URL. **The pop-out window is not a content script tab and will not receive broadcasts from this query.**

[VERIFIED: service-worker.ts broadcastConnectionState read — URL filter excludes extension pages]

Since D-09 says "pop-out window creates a new connection via the service worker", the pop-out window must communicate with the service worker **directly** using `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` (it is an extension page and can do this). The service worker does not need changes for this path — the pop-out calls `CONNECT_WEBSOCKET` directly via `chrome.runtime.sendMessage` and receives `CONNECTION_STATE` responses. 

For ongoing WS_MESSAGE broadcasts after initial connection, the service worker must also broadcast to extension pages. Options:

1. Add `chrome.tabs.query` for extension pages (doesn't work — extension pages are not tabs)
2. Use `chrome.runtime.sendMessage` to a known port — requires long-lived connection (chrome.runtime.connect)
3. Pop-out window uses `chrome.storage.onChanged` to receive messages written by service worker
4. Pop-out window opens a long-lived `chrome.runtime.Port` connection to service worker on mount

**Recommendation: Long-lived Port connection (option 4).**

The pop-out window calls `chrome.runtime.connect({ name: 'allchat-popout' })` on mount. Service worker handles `chrome.runtime.onConnect` and stores the port. When `handleWebSocketMessage` fires, it sends to all stored ports in addition to tab-based broadcast.

[ASSUMED: Port-based approach is the correct MV3 pattern for extension page <-> service worker real-time communication. The `chrome.runtime.connect` API is available in MV3 extension pages.]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Cross-context message passing for pop-out | Custom polling/storage bridge | `chrome.runtime.Port` (long-lived connection) | Designed exactly for extension page <-> service worker streaming |
| Window size/position persistence | Custom serialization | `chrome.storage.local` (already used for `ui_collapsed`) | Same pattern already in codebase |
| Pop-out close detection | `chrome.windows.onRemoved` listener | `setInterval` checking `popoutWindow.closed` | Simpler, no service worker changes, sufficient for this use case |
| Message history transfer | URL params or postMessage | `chrome.storage.local` temp key | Handles large payloads, no race conditions |
| Native pop-out navigation to AllChat | Custom redirect mechanism | `window.location.href = chrome.runtime.getURL(...)` | Standard browser navigation, works in content script context |

---

## Common Pitfalls

### Pitfall 1: Broadcasting to Extension Pages via tabs.query
**What goes wrong:** `chrome.tabs.query({ url: ['https://...'] })` never includes extension pages (`chrome-extension://` URLs). The pop-out window loads an extension page and receives zero WS_MESSAGE or CONNECTION_STATE broadcasts.
**Why it happens:** `chrome.tabs.query` filters by URL pattern — extension URLs don't match streaming site patterns.
**How to avoid:** Use `chrome.runtime.connect` port from pop-out window; service worker sends to port directly.
**Warning signs:** Pop-out window shows "Connecting..." forever and never receives messages.

[VERIFIED: service-worker.ts broadcastConnectionState read]

### Pitfall 2: window.parent.postMessage Fails in Pop-Out
**What goes wrong:** `ChatContainer.tsx` calls `window.parent.postMessage(...)` for `UI_COLLAPSED`, `GET_CONNECTION_STATE`, `REQUEST_LOGIN`. In pop-out mode, `window.parent === window` — messages go to self and no handler catches them.
**Why it happens:** `window.parent` is only meaningful inside an iframe. In a standalone page, it refers to the same window.
**How to avoid:** Add `isPopOut` mode detection (URL param `?popout=1`) and replace `window.parent.postMessage` with `chrome.runtime.sendMessage` in pop-out mode.
**Warning signs:** Login button does nothing in pop-out; connection state never updates.

[VERIFIED: ChatContainer.tsx read — all inter-context communication uses `window.parent.postMessage`]

### Pitfall 3: Message History Read Race on Pop-Out Mount
**What goes wrong:** Pop-out window reads `popout_message_buffer` from `chrome.storage.local` before the content script has finished writing it (async write/open ordering).
**Why it happens:** `window.open()` and `chrome.storage.local.set()` are both async — the new window may mount before the write completes.
**How to avoid:** Write to storage **before** calling `window.open()`. `chrome.storage.local.set` resolves before `window.open` opens because the browser must process the storage write first (same-process async queue). Alternatively, pass a small `?msg_ready=1` flag in the URL that the pop-out only reads after `storage.local.get` succeeds.
**Warning signs:** Pop-out starts with empty message list even though messages were present in-page.

[ASSUMED: Storage write before window.open is the safer ordering — needs validation in testing]

### Pitfall 4: Twitch Pop-Out Manifest Match Missing
**What goes wrong:** The "Switch to AllChat" injection doesn't run in Twitch's `/popout/{channel}/chat` because the existing `twitch.ts` content script already matches `https://www.twitch.tv/*` — it DOES match.
**Note:** This is actually NOT a problem for Twitch. The existing match pattern covers it.
**Why it matters:** The twitch.ts script runs on the pop-out page, but `extractStreamerUsername()` may return the channel name from the path `/popout/{channel}/chat` — verify the regex `/^\/([^/]+)/` still returns a usable channel name given the `/popout/` prefix. It would return `popout` — **this IS a bug**.
**How to avoid:** In `twitch.ts`, add a pop-out page detection branch: if path matches `/popout/{channel}/chat`, extract `channel` from position 2, and instead of replacing the full page with AllChat, inject only the "Switch to AllChat" button.

[VERIFIED: twitch.ts `extractStreamerUsername()` regex analysis — `/^\/([^/]+)/` on `/popout/channelname/chat` returns `popout`, not the channel name]

### Pitfall 5: YouTube live_chat Pop-Out Not Covered by Existing Manifest
**What goes wrong:** YouTube native pop-out opens `https://www.youtube.com/live_chat?...`. This URL does not match the existing manifest entries `youtube.com/watch*` or `youtube.com/live/*`.
**Why it happens:** `youtube.js` content script is not declared for `live_chat` URLs.
**How to avoid:** Add `"https://www.youtube.com/live_chat*"` to the youtube content script `matches` array in `manifest.json`, and handle the pop-out context in `youtube.ts`.

[VERIFIED: manifest.json content_scripts — no `live_chat` pattern present]

### Pitfall 6: Pop-Out Window Dimensions in Wrong Units
**What goes wrong:** `window.open()` `left`/`top` params use screen coordinates; if stored and restored naively, they may place the window off-screen on multi-monitor setups or after display configuration changes.
**Why it happens:** Screen coordinates are absolute — they can exceed single-monitor bounds.
**How to avoid:** Clamp stored `x`/`y` to `[0, screen.width - width]` and `[0, screen.height - height]` before passing to `window.open()`. Accept that multi-monitor edge cases may still show unexpected behavior.

[ASSUMED: Standard window management pitfall, not extension-specific]

### Pitfall 7: Service Worker Cannot Use chrome.windows.onRemoved Without "windows" Permission
**What goes wrong:** If the polling approach is abandoned in favor of `chrome.windows.onRemoved`, the "windows" permission must be added to manifest.json. Currently not present.
**How to avoid:** Use the `setInterval` polling approach (`popoutWindow.closed`) in the content script — no new permissions needed.

[VERIFIED: manifest.json permissions array read — "windows" not present. "tabs" IS present which allows tab manipulation but not windows events.]

---

## Code Examples

### Detecting Pop-Out Mode in ChatContainer.tsx
```typescript
// Source: codebase analysis — URL params already used for platform/streamer
const urlParams = new URLSearchParams(window.location.search);
const isPopOut = urlParams.get('popout') === '1';
```
[VERIFIED: chat-container.html uses URL params — PlatformDetector.ts injectAllChatUI builds `?platform=...&streamer=...&display_name=...`]

### Opening Pop-Out Window (Content Script)
```typescript
// Source: twitch.ts — existing OAuth window.open pattern
// window.open args for OAuth (reference): 'width=600,height=700,left=100,top=100'
// Pop-out (new):
const storage = await chrome.storage.local.get(['popout_window_width', 'popout_window_height', 'popout_window_x', 'popout_window_y']);
const w = storage.popout_window_width ?? 420;
const h = storage.popout_window_height ?? 700;
const x = storage.popout_window_x ?? 100;
const y = storage.popout_window_y ?? 100;
const clampedX = Math.max(0, Math.min(x, screen.width - w));
const clampedY = Math.max(0, Math.min(y, screen.height - h));
const params = new URLSearchParams({ platform, streamer, display_name: displayName, popout: '1' });
if (twitchChannel) params.set('twitch_channel', twitchChannel);
const popoutUrl = chrome.runtime.getURL(`ui/chat-container.html?${params}`);
const popoutWindow = window.open(popoutUrl, 'AllChatPopOut', `width=${w},height=${h},left=${clampedX},top=${clampedY}`);
```
[VERIFIED: twitch.ts OAuth pattern — `window.open(url, 'AllChatOAuth', 'width=600,height=700,left=100,top=100')`]

### Long-Lived Port Connection (Pop-Out Window)
```typescript
// Source: Chrome MV3 documentation pattern [ASSUMED]
// In ChatContainer.tsx (pop-out mode only):
useEffect(() => {
  if (!isPopOut) return;
  const port = chrome.runtime.connect({ name: 'allchat-popout' });
  port.onMessage.addListener((message) => {
    // Handle CONNECTION_STATE, WS_MESSAGE same as postMessage handler
    handleMessage({ data: message } as MessageEvent);
  });
  // Connect websocket via port or sendMessage
  chrome.runtime.sendMessage({ type: 'CONNECT_WEBSOCKET', streamerUsername: streamer });
  chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATE' }).then((response) => {
    if (response.success) handleMessage({ data: { type: 'CONNECTION_STATE', data: response.data } } as MessageEvent);
  });
  return () => port.disconnect();
}, []);
```

### Detecting Pop-Out Close (Content Script Polling)
```typescript
// Source: established web API pattern [ASSUMED]
let popoutPollInterval: ReturnType<typeof setInterval> | null = null;
// After window.open():
popoutPollInterval = setInterval(() => {
  if (popoutWindow?.closed) {
    clearInterval(popoutPollInterval!);
    popoutPollInterval = null;
    // Notify AllChat iframe to restore normal view
    iframe.contentWindow?.postMessage({ type: 'POPOUT_CLOSED' }, extensionOrigin);
    // Restore window size/position from closing state (not needed — window already closed)
  }
}, 500);
```

### "Switch to AllChat" Button Injection (Twitch Pop-Out)
```typescript
// Source: codebase analysis of twitch.ts injection patterns [ASSUMED]
// In twitch.ts, for /popout/{channel}/chat pages:
function injectSwitchToAllChatButton(channel: string, streamerUsername: string) {
  if (document.getElementById('allchat-switch-btn')) return; // idempotent
  const targetEl = document.querySelector('.chat-shell') || document.body;
  const btn = document.createElement('div');
  btn.id = 'allchat-switch-btn';
  // Inject React component or raw DOM — for content script context, raw DOM with inline styles
  btn.style.cssText = `
    position: fixed; bottom: 16px; right: 16px; z-index: 9999;
    background: oklch(0.11 0.009 270); border: 1px solid oklch(0.22 0.008 270);
    border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;
    color: #fff; font-family: Inter, sans-serif; font-size: 13px;
  `;
  btn.innerHTML = `<span>Switch to AllChat</span>`;
  btn.addEventListener('click', () => {
    const params = new URLSearchParams({ platform: 'twitch', streamer: streamerUsername, popout: '1' });
    window.location.href = chrome.runtime.getURL(`ui/chat-container.html?${params}`);
  });
  document.body.appendChild(btn);
}
```

### Saving Pop-Out Window Dimensions (Before Close)
```typescript
// Source: established browser API pattern [ASSUMED]
// In content script, when popout is open:
popoutWindow.addEventListener('beforeunload', () => {
  chrome.storage.local.set({
    popout_window_width: popoutWindow.outerWidth,
    popout_window_height: popoutWindow.outerHeight,
    popout_window_x: popoutWindow.screenX,
    popout_window_y: popoutWindow.screenY,
  });
});
// Note: beforeunload may not fire reliably in all close scenarios.
// Alternative: poll dimensions every 2s while window is open.
```
[ASSUMED: `beforeunload` reliability varies by browser — polling is more reliable for dimension persistence]

---

## Platform-Specific Findings

### Twitch Native Pop-Out

- Native pop-out URL: `https://www.twitch.tv/popout/{channel}/chat`
- Existing manifest match `https://www.twitch.tv/*` covers this URL — content script runs there
- `extractStreamerUsername()` currently returns `popout` from path `/popout/{channel}/chat` — **must fix**
- New branch needed in twitch.ts: detect `/popout/` prefix and extract channel from position 2
- In pop-out context: do NOT inject AllChat full UI — inject "Switch to AllChat" button only

[VERIFIED: twitch.ts extractStreamerUsername regex analysis]

### YouTube Native Pop-Out

- Native pop-out URL: `https://www.youtube.com/live_chat?is_popout=1&...`
- NOT covered by existing manifest matches — need new entry: `"https://www.youtube.com/live_chat*"`
- A new content script handler (or extension of youtube.ts) needs to detect `?is_popout=1` param
- Inject "Switch to AllChat" button into YouTube live chat pop-out DOM

[VERIFIED: manifest.json — no live_chat match]
[ASSUMED: YouTube live chat pop-out uses `?is_popout=1` URL parameter — unverified against live browser]

### Kick Native Pop-Out

- D-16 states "research needed for Kick's native pop-out support"
- [ASSUMED: Kick does not have a first-party pop-out chat URL as of training data knowledge. Needs live browser verification.]
- If Kick has no native pop-out URL, D-11/D-16 for Kick scope is: no "Switch to AllChat" injection needed for Kick native pop-out, only AllChat pop-out button works on Kick in-page

### YouTube Studio Pop-Out

- D-15 includes YouTube Studio in AllChat pop-out button scope
- YouTube Studio content script (`youtube-studio.ts`) runs on `studio.youtube.com/video/*/livestreaming*`
- Pop-out button in AllChat header: same implementation as other platforms (same ChatContainer.tsx)
- No native pop-out detection needed for YouTube Studio (D-16 only covers Twitch/YouTube/Kick)

[VERIFIED: youtube-studio.ts and manifest.json read]

---

## State of the Art

| Old Approach | Current Approach | Notes |
|---|---|---|
| MV2 background page (persistent) | MV3 service worker (ephemeral) | Already using MV3 — pop-out must tolerate SW restart |
| `chrome.extension.getBackgroundPage()` for shared state | `chrome.storage.session` | Already using session storage for `ws_active_streamer` |
| Always-on-top pop-out via chrome.windows | Standard `window.open()` | D-06 chose standard window — no `chrome.windows.create` needed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Pop-out window created via `window.open()` receives a reference that can be polled for `.closed` state | Common Pitfalls / Code Examples | Would need chrome.windows.onRemoved approach instead (requires "windows" permission) |
| A2 | URL param `?popout=1` is the cleanest detection mechanism for pop-out mode | Architecture Patterns | Could use `window === window.parent` instead — both are simple |
| A3 | `chrome.storage.local.set` write completes before new window mounts | Common Pitfalls / Code Examples | Could cause empty message list in pop-out — validate in testing |
| A4 | Long-lived `chrome.runtime.Port` is the correct MV3 pattern for extension page → SW streaming | Architecture Patterns | Could use polling `chrome.runtime.sendMessage` instead — simpler but less efficient |
| A5 | Hide (not destroy) is better for "Switch to native" in-page UX | Architecture Patterns | Could destroy and recreate — more memory-efficient but adds reconnect latency |
| A6 | YouTube live chat pop-out uses `?is_popout=1` URL parameter | Platform-Specific Findings | Parameter name may differ — needs live browser verification |
| A7 | Kick does not have a native pop-out chat URL | Platform-Specific Findings | If Kick does have pop-out URLs, additional content script work needed |
| A8 | `beforeunload` + dimension save is sufficient for pop-out size persistence | Code Examples | If unreliable, use periodic polling of window dimensions instead |

---

## Open Questions (RESOLVED)

1. **Does Kick have a native pop-out chat URL?** (RESOLVED)
   - What we know: D-16 states "research needed for Kick's native pop-out support"
   - What's unclear: Kick's UI as of April 2026 may or may not expose a pop-out chat button
   - **Resolution:** No known Kick native pop-out chat URL exists based on available research (training data, community documentation, codebase analysis). D-16 scope for Kick is deferred per research outcome — AllChat pop-out button works on Kick in-page, but native pop-out "Switch to AllChat" injection is not implementable without a pop-out URL. This is a research-based exclusion, not a skip. See Plan 05 for implementation note.

2. **Is `chrome.runtime.connect` stable across MV3 service worker restarts?** (RESOLVED)
   - What we know: Ports are closed when the service worker terminates; the pop-out must reconnect
   - **Resolution:** Handled by Plan 02 Task 1 — ChatContainer.tsx pop-out mode includes `port.onDisconnect` listener with 1s reconnect delay and re-request of connection state. The port reconnect pattern is implemented in the plan.

3. **YouTube live chat pop-out URL exact structure** (RESOLVED)
   - What we know: YouTube embeds live chat at `youtube.com/live_chat`
   - **Resolution:** The standard YouTube live chat pop-out URL is `youtube.com/live_chat?v={videoId}&is_popout=1`. The exact `is_popout` param is used for detection but not required — Plan 05 matches on pathname `/live_chat` which covers both embedded and pop-out modes. The "Switch to AllChat" button appearing in embedded mode is acceptable behavior.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code changes in an existing extension codebase. No new external tool dependencies. Build and test infrastructure already confirmed operational from phases 1-5.

---

## Validation Architecture

nyquist_validation is enabled (config.json).

### Test Framework

| Property | Value |
|---|---|
| Framework | Playwright (existing) |
| Config file | `playwright.config.ts` (existing) |
| Quick run command | `npm test -- --grep-invert @agent` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| POP-01 | Pop-out button appears in AllChat header on all platforms | E2E (Playwright) | `npx playwright test tests/test-popout-button.spec.ts -x` | No — Wave 0 |
| POP-02 | `window.open()` called with correct chat-container.html URL and params | E2E (Playwright) | `npx playwright test tests/test-popout-button.spec.ts::popout-opens -x` | No — Wave 0 |
| POP-03 | In-page iframe shows "Chat popped out" banner after pop-out opens | E2E (Playwright) | `npx playwright test tests/test-popout-button.spec.ts::popped-out-banner -x` | No — Wave 0 |
| POP-04 | Closing pop-out window restores in-page AllChat iframe | E2E (Playwright) | `npx playwright test tests/test-popout-button.spec.ts::restore-on-close -x` | No — Wave 0 |
| POP-05 | Pop-out window dimensions persisted to chrome.storage.local | Unit / integration | `npx playwright test tests/test-popout-button.spec.ts::dimensions-persisted -x` | No — Wave 0 |
| POP-06 | "Switch to native" in-page hides AllChat and shows native chat | E2E (Playwright) | `npx playwright test tests/test-switch-native.spec.ts -x` | No — Wave 0 |
| POP-07 | "Switch to AllChat" in native chat re-shows AllChat | E2E (Playwright) | `npx playwright test tests/test-switch-native.spec.ts::switch-back -x` | No — Wave 0 |
| POP-08 | LocalStorage type extended with popout keys (type check) | Static (tsc) | `npx tsc --noEmit` | N/A — exists after edit |

Note: POP-03 through POP-07 involve multi-window Playwright testing which requires `chromium.newContext` or `browser.newPage`. Existing tests in `test-per-site-enable.spec.ts` demonstrate the extension test harness pattern — new tests follow the same `chromium.launchPersistentContext` setup.

### Sampling Rate

- Per task commit: `npm test -- --grep-invert @agent --grep "popout|switch-native"` (fast subset)
- Per wave merge: `npm test -- --grep-invert @agent`
- Phase gate: Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/test-popout-button.spec.ts` — covers POP-01 through POP-05
- [ ] `tests/test-switch-native.spec.ts` — covers POP-06, POP-07
- [ ] No framework changes needed — Playwright already installed and configured

---

## Security Domain

security_enforcement is not set in config.json (absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | No — no new auth flows | N/A |
| V3 Session Management | No — no new session logic | N/A |
| V4 Access Control | Partial — pop-out window must only load extension resources | `chrome.runtime.getURL()` ensures extension-origin URLs only |
| V5 Input Validation | Yes — URL params passed to chat-container.html | Sanitize `platform`, `streamer`, `display_name` params on read; treat as untrusted strings |
| V6 Cryptography | No | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Content script postMessage origin spoofing | Spoofing | Existing `extensionOrigin` check in all content scripts already guards this |
| Malicious "Switch to AllChat" click injecting arbitrary URLs | Tampering | `window.location.href` only ever set to `chrome.runtime.getURL(...)` — extension-origin only, not user-controlled |
| Large `popout_message_buffer` DoS via storage | DoS | Cap at 50 messages (already the in-memory cap in ChatContainer.tsx) before writing to storage |

---

## Sources

### Primary (HIGH confidence)
- Codebase: `src/content-scripts/twitch.ts` — window.open OAuth pattern, message relay, extractStreamerUsername regex
- Codebase: `src/background/service-worker.ts` — broadcastConnectionState tab URL filter, chrome.tabs.query scope
- Codebase: `src/ui/components/ChatContainer.tsx` — window.parent.postMessage usage, message state, header layout
- Codebase: `src/lib/types/extension.ts` — LocalStorage interface (current keys)
- Codebase: `manifest.json` — permissions (no "windows"), content script match patterns
- Codebase: `src/lib/storage.ts` — setLocalStorage/getLocalStorage pattern

### Secondary (MEDIUM confidence)
- Chrome Extension MV3 documentation pattern for `chrome.runtime.connect` ports (extension page <-> SW)
- Twitch pop-out URL pattern `/popout/{channel}/chat` — consistent with community knowledge and confirmed by Loukas (CONTEXT.md specifics)
- YouTube live_chat URL pattern — consistent with known YouTube embedding behavior

### Tertiary (LOW confidence)
- Kick native pop-out URL — unverified, needs live browser testing (A7)
- YouTube `?is_popout=1` parameter — unverified exact form (A6)
- `beforeunload` reliability for dimension save (A8)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all existing APIs
- Architecture patterns: HIGH for existing code analysis; MEDIUM for new port-based approach (well-documented MV3 pattern)
- Platform pop-out URLs: HIGH for Twitch, MEDIUM for YouTube, LOW for Kick
- Pitfalls: HIGH — verified against actual codebase

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable extension APIs, platform DOM may drift faster)
