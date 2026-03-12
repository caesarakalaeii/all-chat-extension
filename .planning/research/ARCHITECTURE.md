# Architecture Patterns

**Domain:** Chrome Extension — Multi-Platform Chat DOM Injection
**Researched:** 2026-03-12
**Confidence:** HIGH (derived from existing codebase + known platform DOM patterns)

---

## Existing Architecture (Baseline)

The extension follows a three-layer architecture. Understanding this baseline is required before reasoning about the milestone changes.

```
allch.at WebSocket
  └─ Service Worker (background.js)
       ├─ chrome.tabs.sendMessage → Content Script (twitch.ts / youtube.ts)
       │    └─ postMessage → iframe (chat-container.html)
       │         └─ React UI (chat-bundle.js)
       └─ fetch (CORS proxy) → allch.at REST API
```

### What Changes in This Milestone

| Layer | Current State | Target State |
|-------|--------------|--------------|
| Twitch injection | `position:fixed` overlay appended to `document.body` | iframe mounted inside the native chat DOM slot, replacing it |
| YouTube injection | overlay appended to parent of `ytd-live-chat-frame` | iframe mounted directly in the chat slot; native `ytd-live-chat-frame` hidden/replaced |
| Kick | Not implemented | Full content script, matching the Twitch/YouTube pattern |
| Test harness | Playwright with static CSS selectors hitting real Twitch.tv | Playwright + WebSocket mock server + LLM agent as the test driver |

---

## Component Boundaries (After Milestone)

```
manifest.json
├─ content_scripts
│   ├─ twitch.js          ← injects into twitch.tv DOM slots
│   ├─ youtube.js         ← injects into youtube.com DOM slots
│   └─ kick.js            ← NEW: injects into kick.com DOM slots
│        all extend PlatformDetector (base/PlatformDetector.ts)
├─ background.js          ← service worker; no changes needed this milestone
└─ web_accessible_resources
     └─ ui/chat-container.html   ← iframe payload; React UI lives here

tests/
├─ fixtures/
│   └─ mock-ws-server.ts  ← NEW: WebSocket mock server (ws library)
├─ helpers/
│   └─ llm-agent.ts       ← NEW: LLM API wrapper that drives Playwright page
├─ twitch-injection.spec.ts    ← NEW: slot injection tests
├─ youtube-injection.spec.ts   ← NEW: slot injection tests
├─ kick-injection.spec.ts      ← NEW: Kick content script tests
└─ agent-chat-flow.spec.ts     ← NEW: LLM-driven end-to-end flows
```

---

## Platform DOM Structures and Selectors

### Twitch

Twitch is a React SPA. The chat panel lives inside a right-column that React re-renders on navigation and feature flag changes. The native chat container should be replaced — not just covered — to eliminate the overlay's z-index fragility.

**Layout structure (simplified):**
```
div.channel-root
  div.channel-root__right-column          ← right column wrapper
    div.chat-shell                         ← chat panel root
      div[data-test-selector="chat-scrollable-area__message-container"]
        div[role="log"]                    ← ARIA chat log (very stable)
      div.chat-input-tray                  ← input area
```

**Injection target:** Replace the content of `.chat-shell` rather than the entire right column. This keeps Twitch's layout intact while giving full control over what appears inside the chat panel.

**Selector priority (most to least stable):**
1. `[data-test-selector="chat-scrollable-area__message-container"]` — data-test selectors are intentionally stable at Twitch; they're used by Twitch's own automation
2. `div[role="log"]` — ARIA role; semantically stable
3. `.chat-scrollable-area__message-container` — class name; moderately stable
4. `.chat-shell` — legacy/wrapper class; use as fallback only

**Slot injection strategy:**
- Query `.chat-shell` or its closest ancestor that contains both chat log and input
- `element.innerHTML = ''` to clear native children
- Append the `#allchat-container` div, then append the iframe inside it
- Do NOT use `display:none` on the native container itself — Twitch's layout engine will collapse or shift adjacent panels. Instead replace the children.

**SPA navigation:**
- Twitch uses `history.pushState`. URL changes without a page reload.
- The current approach (MutationObserver on `document` + URL diff) works but is expensive. Preferred pattern: listen to `popstate` and `history.pushState` override together, debounced at 300ms. Only trigger re-injection when the pathname segment changes (i.e., streamer name changes), not on every DOM mutation.
- After navigation, Twitch's React unmounts and remounts the chat shell. This removes our injected container. The URL watcher fires re-injection via `init()` after `TWITCH_INIT_DELAY` (1000ms). This delay is currently acceptable.

**Current problem in existing code:**
`createInjectionPoint()` on Twitch appends a `position:fixed` div to `document.body`. This is the overlay approach. The slot approach requires finding `.chat-shell` and replacing its children. The `hideNativeChat()` CSS injection (`visibility:hidden`) becomes unnecessary when using true slot replacement.

---

### YouTube

YouTube is a custom-element SPA (`ytd-*` elements) rendered by Polymer/Lit. The live chat panel is an iframe element loaded by YouTube itself — `ytd-live-chat-frame` wraps a nested iframe pointing to `https://www.youtube.com/live_chat?...`. This is the key structural difference from Twitch.

**Layout structure (simplified):**
```
ytd-watch-flexy
  #columns
    #secondary                          ← right column
      #secondary-inner
        ytd-live-chat-frame             ← YouTube's own chat container element
          #chat-container               ← shadow DOM boundary
            iframe[src*="live_chat"]   ← YouTube's own chat iframe
```

**Critical detail:** `ytd-live-chat-frame` is a custom element with a shadow DOM. The inner iframe is `youtube.com/live_chat?...` — a separate document entirely. Our injection should replace or hide `ytd-live-chat-frame` as a whole unit, not try to reach inside it.

**Injection strategy (slot replacement):**
1. Query `ytd-live-chat-frame` — this is the most stable selector; it's a registered custom element name
2. Apply `display:none` to `ytd-live-chat-frame` (current approach in `hideNativeChat()` is correct here)
3. Insert `#allchat-container` as `nextSibling` of `ytd-live-chat-frame` with matching dimensions
4. Use `ytd-live-chat-frame`'s computed dimensions and position via `getBoundingClientRect()` to size the replacement container correctly
5. Optionally use a ResizeObserver on the parent `#secondary-inner` to track dimension changes

**Why `display:none` works for YouTube but not Twitch:**
YouTube's layout is grid/flex on `#secondary-inner`. Hiding `ytd-live-chat-frame` collapses that grid cell. The replacement div must fill that space explicitly using `height: 100%` on a flex child, or by matching computed pixel dimensions. The current `youtube.ts` `createInjectionPoint()` does `parent.appendChild(container)` which places our container after the hidden `ytd-live-chat-frame` — this is correct but the sizing must be verified.

**Selector priority:**
1. `ytd-live-chat-frame` — custom element name; most stable (changing this breaks YouTube's own API contracts)
2. `#chat-container` — ID inside the shadow root; less reliable since it's inside shadow DOM
3. `#chat` — outer wrapper

**SPA navigation:**
YouTube fires `yt-navigate-finish` as a custom event on `document` for SPA navigations. This is significantly more reliable than a MutationObserver URL diff.

```typescript
document.addEventListener('yt-navigate-finish', () => {
  setTimeout(() => detector?.init(), YOUTUBE_INIT_DELAY);
});
```

The current URL watcher uses a MutationObserver on `document` checking `location.href` — replace this with `yt-navigate-finish` to reduce overhead and improve reliability.

**YouTube live detection stability:**
The current 4-method detection is correct but fragile. The most reliable signal is: `document.querySelector('ytd-live-chat-frame') !== null`. If the element exists in the DOM, we are on a live stream. This is the first method listed in `youtube.ts` and should be elevated to the sole primary check, with others as fallbacks only for edge cases where the element loads slowly.

---

### Kick

Kick is a Vue 3 + Nuxt SPA. Its DOM structure is more stable than Twitch because Kick does not obfuscate class names — it uses semantic component names and data attributes.

**Layout structure (from known DOM, MEDIUM confidence):**
```
#app
  .channel-page
    .channel-page__right-col               ← right column
      #channel-chatroom                    ← chat panel root — stable ID
        .chatroom-wrapper
          #chatroom                        ← inner chat wrapper — stable ID
            .chatroom-messages-list        ← scrollable message area
          .chat-input                      ← input area
```

**Injection target:** `#channel-chatroom` — this is the outermost stable ID for the entire chat panel. Clear its children and replace with our container, identical to the Twitch slot strategy.

**Selector priority:**
1. `#channel-chatroom` — stable ID, present on all stream pages
2. `#chatroom` — inner wrapper
3. `.chatroom-wrapper` — class name
4. `[data-chatroom-id]` — data attribute if present

**URL format:** `kick.com/{username}` — same pattern as Twitch. No `/live/` prefix for live streams.

**Live stream detection:**
Kick does not have a YouTube-style custom element for live chat. The reliable signal is: `document.querySelector('#channel-chatroom')` exists. A secondary check is the presence of a `LIVE` badge: `.broadcast-header__live-badge` or similar.

**SPA navigation:**
Kick uses Vue Router with `history` mode. Standard `popstate` + `history.pushState` override pattern applies. No platform-specific navigation event (unlike YouTube's `yt-navigate-finish`). The same URL watcher approach used for Twitch applies here.

**Key differences from Twitch/YouTube:**

| Aspect | Twitch | YouTube | Kick |
|--------|--------|---------|------|
| Framework | React (obfuscated classes) | Polymer/custom elements | Vue 3 / Nuxt |
| Class stability | Low (minified, change frequently) | Medium (custom elements stable) | High (semantic names) |
| Chat element | `.chat-shell` / `[role="log"]` | `ytd-live-chat-frame` | `#channel-chatroom` |
| SPA event | None (use URL watcher) | `yt-navigate-finish` | None (use URL watcher) |
| Chat input location | Inside chat shell | Inside `ytd-live-chat-frame` | Inside `#channel-chatroom` |
| Native chat is iframe | No | Yes (YouTube-owned `live_chat`) | No |

**Manifest additions needed for Kick:**
```json
{
  "content_scripts": [
    {
      "matches": ["https://kick.com/*"],
      "js": ["content-scripts/kick.js"],
      "css": ["content-scripts/styles.css"],
      "run_at": "document_idle"
    }
  ],
  "host_permissions": [
    "https://kick.com/*"
  ],
  "web_accessible_resources": [
    {
      "resources": ["ui/chat-container.html", "ui/chat-bundle.js", "ui/chat-styles.css", "assets/*"],
      "matches": ["https://kick.com/*"]
    }
  ]
}
```

---

## Slot Injection Pattern (Canonical)

The target pattern for all three platforms. Replaces the existing overlay approach on Twitch and extends YouTube to fill its slot correctly.

```
DETECT phase:
  waitForElement(selectors, { timeout: 5000, retryInterval: 200 })
    └─ resolves when first matching element appears in DOM

INJECT phase:
  target = waitForElement result
  parent = target.parentElement
  allchatContainer = createElement('div', { id: 'allchat-container' })
  allchatContainer.style = 'width:100%; height:100%; display:flex; flex-direction:column;'
  parent.insertBefore(allchatContainer, target)  ← or replaceChild
  hideNativeElement(target)
  iframe = createElement('iframe')
  iframe.src = chrome.runtime.getURL('ui/chat-container.html')
  iframe.dataset.platform = this.platform
  iframe.dataset.streamer = username
  allchatContainer.appendChild(iframe)

GUARD phase (MutationObserver):
  observe parent for childList changes
  if allchatContainer removed from parent: re-run INJECT phase (debounced 300ms)
  if target (native element) re-appears and is visible: re-hide it
```

**`waitForElement` utility (to replace current setTimeout + direct query):**

```typescript
function waitForElement(
  selectors: string[],
  options: { timeout: number; retryInterval: number } = { timeout: 8000, retryInterval: 250 }
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + options.timeout;
    const attempt = () => {
      for (const selector of selectors) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) { resolve(el); return; }
      }
      if (Date.now() >= deadline) { reject(new Error('Element not found: ' + selectors.join(', '))); return; }
      setTimeout(attempt, options.retryInterval);
    };
    attempt();
  });
}
```

This replaces the current `setTimeout(init, PLATFORM_INIT_DELAY)` flat wait with a polling wait that resolves as soon as the element is ready, rather than after an arbitrary fixed delay.

---

## Data Flow (Per Component)

### Kick Content Script (new)

```
kick.ts loads at document_idle
  → initialize()
    → getSyncStorage() — check extensionEnabled
    → new KickDetector()
    → setupGlobalMessageRelay()       ← identical pattern to twitch.ts
    → waitForElement(['#channel-chatroom'], ...)
    → KickDetector.init()
        → extractStreamerUsername()   ← from pathname: /username
        → checkStreamerExists()       ← chrome.runtime.sendMessage GET_STREAMER_INFO
        → hideNativeChat()            ← display:none on #channel-chatroom children OR replace
        → createInjectionPoint()      ← insert #allchat-container before #channel-chatroom
        → injectAllChatUI()           ← iframe mounted in #allchat-container
        → connectWebSocket()          ← chrome.runtime.sendMessage CONNECT_WEBSOCKET
  → setupUrlWatcher()                 ← popstate + pushState override, debounced
  → setupMutationObserver()           ← guard against Vue re-renders removing our container
```

### YouTube Slot Injection (fix to existing)

The current `createInjectionPoint()` in `youtube.ts` appends `#allchat-container` to the parent of `ytd-live-chat-frame`. The fix:
1. Use `insertBefore(allchatContainer, nativeChat)` rather than `appendChild` so our container occupies the same flex slot as the native element
2. Apply `display:none` only to `ytd-live-chat-frame`, not to parent elements
3. Add a ResizeObserver on `#secondary-inner` to reapply sizing when YouTube changes panel dimensions

### Twitch Slot Injection (refactor from overlay)

The refactor converts `createInjectionPoint()` from appending to `document.body` to:
1. Query `.chat-shell` (the first stable selector in `getChatContainerSelector()`)
2. Replace its children with `#allchat-container`
3. Remove the `position:fixed` CSS from the container
4. Remove the `hideNativeChat()` CSS injection — no longer needed since the native DOM is replaced, not hidden

---

## LLM-Agent Test Harness Architecture

### Overview

The test harness has three components that work together: a mock WebSocket server that replaces the real `allch.at` backend, a Playwright browser context with the extension loaded, and an LLM agent that receives page screenshots/DOM and decides what actions to take.

```
┌─────────────────────────────────────────────────────────────┐
│  Test Process (Node.js)                                      │
│                                                              │
│  ┌──────────────────┐    WebSocket    ┌───────────────────┐  │
│  │  Mock WS Server  │◄───────────────►│  Service Worker   │  │
│  │  (ws library)    │                 │  (in extension)   │  │
│  │  :8765           │                 └───────────────────┘  │
│  └──────────────────┘                                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Playwright BrowserContext (chromium.launchPersistent)│   │
│  │  Extension loaded from dist/                          │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  Page: file:///tests/fixtures/mock-stream.html │  │   │
│  │  │  (or real twitch.tv / kick.com page)           │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  LLM Agent (llm-agent.ts)                            │    │
│  │  - Takes screenshot via page.screenshot()            │    │
│  │  - Sends screenshot + task to Claude API             │    │
│  │  - Receives action: click(x,y) / type(text) /        │    │
│  │    assert(condition) / scroll(direction)              │    │
│  │  - Executes action via Playwright                     │    │
│  │  - Loops until task complete or max turns             │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Mock WebSocket Server

The mock server (`tests/fixtures/mock-ws-server.ts`) uses the `ws` npm package. It intercepts the WebSocket connection that the service worker would normally make to `allch.at`.

**Key requirements:**
- Listens on `ws://localhost:8765` (matches the extension's `apiGatewayUrl` when set to `http://localhost:8765` in test storage)
- Emits pre-scripted `WS_MESSAGE` events to simulate incoming chat (streamer_joined, chat_message, etc.)
- Accepts the `CONNECT_WEBSOCKET` signal from the service worker
- Does NOT need to be a full allch.at implementation — just enough to make the service worker enter `connected` state and emit messages

**Extension configuration for tests:**
The test setup must write a specific `apiGatewayUrl` to `chrome.storage.sync` before the content script runs:
```typescript
// In test beforeAll:
await context.serviceWorkers()[0].evaluate(() => {
  chrome.storage.sync.set({ apiGatewayUrl: 'http://localhost:8765', extensionEnabled: true });
});
```

Alternatively, inject via `page.addInitScript` to override `fetch` and `WebSocket` globally in the page/service worker context.

### Mock HTML Fixture for Offline Testing

Rather than hitting real platform URLs (which require authentication and change DOM), create minimal HTML fixtures that replicate the chat slot structure:

`tests/fixtures/mock-twitch-stream.html`:
```html
<!DOCTYPE html>
<html>
<body>
  <div class="channel-root__right-column">
    <div class="chat-shell">
      <div data-test-selector="chat-scrollable-area__message-container">
        <div role="log" class="chat-scrollable-area__message-container">
          <!-- native Twitch chat messages would be here -->
        </div>
      </div>
    </div>
  </div>
</body>
</html>
```

`tests/fixtures/mock-youtube-stream.html`:
```html
<!DOCTYPE html>
<html>
<body>
  <ytd-watch-flexy>
    <div id="secondary"><div id="secondary-inner">
      <ytd-live-chat-frame>
        <div id="chat-container"></div>
      </ytd-live-chat-frame>
    </div></div>
  </ytd-watch-flexy>
</body>
</html>
```

`tests/fixtures/mock-kick-stream.html`:
```html
<!DOCTYPE html>
<html>
<body>
  <div class="channel-page">
    <div class="channel-page__right-col">
      <div id="channel-chatroom">
        <div class="chatroom-wrapper">
          <div id="chatroom">
            <div class="chatroom-messages-list"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
```

These fixtures can be served from a local HTTP server (e.g., `http-server` on port 3001) and loaded in Playwright with `page.goto('http://localhost:3001/mock-twitch-stream.html')`. They avoid the fragility of testing against live production URLs.

**Limitation:** The extension's content scripts only run on `https://www.twitch.tv/*`, `https://www.youtube.com/*`, and `https://kick.com/*` as declared in `manifest.json`. To test with fixture files, either:
1. Use `page.addInitScript` to inject the content script manually (bypassing manifest URL matching), or
2. Declare `http://localhost:3001/*` in `host_permissions` and `content_scripts.matches` for test builds only (controlled by a Webpack `NODE_ENV=test` define), or
3. Use a real browser hitting real URLs with network interception via `page.route()` to mock the allch.at API responses

Option 3 (real URLs + route mocking) is recommended for the injection tests because the platform SPA navigation behavior is exactly what we need to test. The mock WS server handles the backend. Only the `GET_STREAMER_INFO` API call needs to be mocked to return a known streamer.

### LLM Agent Driver

The agent (`tests/helpers/llm-agent.ts`) drives Playwright using a loop:

```
1. page.screenshot() → base64 image
2. Send to Claude (claude-3-5-sonnet) with:
   - System prompt: "You are a test agent for a Chrome extension chat UI..."
   - User message: current task description + screenshot + available actions JSON schema
3. Parse response: { action: 'click' | 'type' | 'scroll' | 'assert' | 'done', params: {...} }
4. Execute via Playwright:
   - click: page.click(selector) or page.mouse.click(x, y)
   - type: page.keyboard.type(text)
   - assert: built-in assertion mapped to expect()
   - done: resolve the task
5. Loop (max 15 turns per task)
```

**What the LLM agent enables that CSS selectors cannot:**
- "Verify that the chat panel looks native to the page" — no selector can assert visual fidelity
- "Type a chat message and confirm it appears in the list" — requires understanding the rendered output, not a DOM path
- "Confirm no layout artifacts appear when switching from one streamer to another" — visual regression check

**Agent action schema (tool-use format for Claude):**
```typescript
type AgentAction =
  | { action: 'click'; selector?: string; x?: number; y?: number }
  | { action: 'type'; text: string }
  | { action: 'scroll'; direction: 'up' | 'down'; amount: number }
  | { action: 'wait'; ms: number }
  | { action: 'assert'; description: string; pass: boolean }
  | { action: 'done'; summary: string };
```

**Integration with Playwright test runner:**
The LLM agent is a helper, not a replacement for `@playwright/test`. Tests still use `test()` and `expect()`. The agent is called within a test to perform a complex multi-step interaction:

```typescript
test('chat panel replaces native chat visually', async ({ page }) => {
  await page.goto('https://www.twitch.tv/somestreamer');
  await waitForInjection(page); // helper: waits for #allchat-container

  const agent = new LlmAgent(page, anthropicClient);
  const result = await agent.runTask(
    'Verify the All-Chat panel is visible in the right column, ' +
    'that no native Twitch chat is visible behind it, ' +
    'and that the chat input area is present at the bottom.'
  );

  expect(result.passed).toBe(true);
  expect(result.summary).not.toContain('overlap');
});
```

---

## Build Order Implications

The dependency order for implementation within this milestone:

```
1. waitForElement utility (base/PlatformDetector.ts)
   └─ Required by all three platform scripts; build this first

2. Twitch slot injection refactor (twitch.ts)
   └─ Highest-stakes change; Twitch is the primary platform
   └─ Validates the slot injection pattern before applying to others

3. YouTube slot injection fix (youtube.ts)
   └─ Depends on: validated slot injection pattern from Twitch
   └─ Adds: yt-navigate-finish SPA navigation listener
   └─ Adds: ResizeObserver for dynamic sizing

4. Kick content script (kick.ts + manifest additions)
   └─ Depends on: validated PlatformDetector base pattern
   └─ New platform: no regression risk on existing platforms
   └─ manifest.json host_permissions and content_scripts entries

5. Mock WS server + fixture HTML files
   └─ Independent of content script changes; build in parallel with steps 2-4
   └─ Required by: LLM agent tests

6. LLM agent helper (tests/helpers/llm-agent.ts)
   └─ Depends on: mock WS server (step 5)
   └─ Independent of: any specific platform content script
   └─ First test target: Twitch injection (step 2 must be complete)

7. Agent-driven tests for all three platforms
   └─ Depends on: all content scripts (steps 2-4) + agent (step 6)
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Fixed-Position Overlay (Current Twitch Approach)
**What:** Appending `position:fixed` div to `document.body` with hardcoded `top: 50px; right: 0; width: 340px`
**Why bad:** Breaks on theater mode, fullscreen, mobile viewports, any Twitch layout experiment. Creates z-index battles. No graceful resize.
**Instead:** Mount into the native chat DOM slot. Let the platform's own CSS control dimensions.

### Anti-Pattern 2: Broad MutationObserver on document.body
**What:** `observer.observe(document.body, { childList: true, subtree: true })` — fires on every DOM change anywhere on the page
**Why bad:** On complex SPAs (Twitch, YouTube), this observer fires hundreds of times per second. The current debounce (500ms) helps but the callback still executes constantly.
**Instead:** After initial injection, scope the observer to the chat container's parent element only. Only watch the subtree of the element that matters.

### Anti-Pattern 3: Reaching Inside YouTube's Live Chat Shadow DOM
**What:** Querying `#chat-container` or `.yt-live-chat-app` inside the shadow root of `ytd-live-chat-frame`
**Why bad:** Shadow DOM is intentionally encapsulated. Selectors that pierce shadow DOM are fragile and platform-version-dependent.
**Instead:** Target `ytd-live-chat-frame` itself (the custom element) and hide it as a whole unit. Never reach into it.

### Anti-Pattern 4: Mocking the Extension at Test Time via Content Script Injection
**What:** Injecting content scripts via `page.addInitScript` to bypass `manifest.json` URL matching and run on fixture files
**Why bad:** The injected script does not have access to `chrome.*` APIs, so `chrome.runtime.sendMessage` will throw. Tests become artificial.
**Instead:** Use real platform URLs with `page.route()` to intercept and mock the allch.at API calls. The extension runs as declared in manifest; only the backend is mocked.

### Anti-Pattern 5: LLM Agent Replacing All Playwright Assertions
**What:** Using the LLM agent for every assertion, including simple DOM checks like "does #allchat-container exist"
**Why bad:** LLM calls are slow (2-5 seconds each), expensive, and non-deterministic. Simple structural assertions should use `expect(page.locator('#allchat-container')).toBeVisible()`.
**Instead:** Use LLM agent only for assertions that require visual or semantic understanding. Structural/DOM assertions use standard Playwright `expect`.

---

## Scalability Considerations

| Concern | Now | At 3 Platforms |
|---------|-----|----------------|
| Content script bundle size | ~120KB per script | Each script is independent; no shared state increases |
| MutationObserver cost | High (broad scope) | Must narrow scope per-platform to avoid 3x observer overhead |
| Service worker tab broadcasts | O(tabs) | Unchanged; SW already broadcasts to all tabs regardless of platform count |
| Test suite runtime | ~30s (2 tests, real URLs) | LLM tests will be 60-90s per test; keep agent tests in a separate suite with `--project=agent-tests` |

---

## Sources

- Existing codebase: `/src/content-scripts/twitch.ts`, `/src/content-scripts/youtube.ts`, `/src/content-scripts/base/PlatformDetector.ts` — HIGH confidence
- Existing architecture: `/.planning/codebase/ARCHITECTURE.md` — HIGH confidence
- Known concerns: `/.planning/codebase/CONCERNS.md` — HIGH confidence
- Kick DOM structure: training data + community knowledge of Kick's Vue/Nuxt stack — MEDIUM confidence (selectors must be verified against live DOM before shipping)
- YouTube `yt-navigate-finish` event: well-documented YouTube SPA navigation pattern — HIGH confidence
- Playwright Chrome extension testing pattern (`chromium.launchPersistentContext`): established pattern in Playwright docs — HIGH confidence; the test in `test-streamer-switch.spec.ts` already uses this correctly
- LLM agent test loop pattern: reasoning from first principles + Playwright API — MEDIUM confidence (no single authoritative source; the approach is sound but implementation details will require iteration)
