# Domain Pitfalls

**Domain:** Chrome MV3 extension — DOM slot injection, multi-platform chat replacement, Tailwind 4 in iframe, LLM-agent Playwright testing
**Researched:** 2026-03-12
**Project:** All-Chat Extension

---

## Critical Pitfalls

Mistakes that cause rewrites or major breakage.

---

### Pitfall 1: Fixed-Position Overlay Survives the Slot Migration

**What goes wrong:**
`twitch.ts` currently appends `#allchat-container` to `document.body` as `position: fixed`. The planned migration mounts the iframe _inside_ the native chat slot instead. If the migration is done incrementally — native chat hidden first, slot injection second — a window exists where `document.body.appendChild` runs on one code path and `nativeSlot.replaceWith(container)` runs on another. The result is two containers: one fixed-position overlay (the old path) and one inside the DOM slot (the new path). The MutationObserver duplicate-container guard in `setupMutationObserver()` removes `allchatContainers[1]` and keeps `allchatContainers[0]` — it does not distinguish by position, so it keeps whichever was inserted first, which may be the legacy overlay.

**Why it happens:**
`createInjectionPoint()` in `TwitchDetector` still contains the `position: fixed` / `document.body.appendChild` implementation. When the base class `init()` calls it and no selector match fires (e.g., timing race), the fallback is body append. The MutationObserver then sees one container, thinks things are fine, and the platform layout breaks silently.

**Consequences:** Chat renders in the wrong position. Native chat column remains empty. Twitch layout shifts. The bug only appears after the first SPA navigation because the new slot is found on the second init call.

**Prevention:**
- Delete the fixed-position body-append path entirely when migrating to slot injection. Never have both code paths alive at the same time, even behind a flag.
- `createInjectionPoint()` should throw (or return null and log a hard error) if it cannot find the native slot, never fall back silently to body append.
- Add an assertion in the MutationObserver that `#allchat-container` has no `position: fixed` inline style.

**Detection:** `document.querySelector('#allchat-container').style.position === 'fixed'` in DevTools after any SPA navigation.

**Phase:** DOM slot injection migration (Phase 1).

---

### Pitfall 2: MutationObserver on `document.body` with `subtree: true` Triggers Reinit Loop

**What goes wrong:**
`setupMutationObserver()` observes `document.body` with `{ childList: true, subtree: true }`. When the all-chat container is inserted into the native slot, that insertion itself fires the MutationObserver. The observer's reinit guard checks `!allchatExists && nativeExists` — both are false after injection, so it doesn't loop. However, when the slot is _replaced_ (not hidden), `nativeExists` (`document.querySelector('.chat-scrollable-area__message-container')`) is no longer found, so `nativeExists = false`. If Twitch's React reconciler re-renders and adds that element back (which it does on every route transition), the guard briefly sees `nativeExists = true && !allchatExists = false`, which is a false positive — the container exists but the selector misses it because it's now inside a different DOM branch.

For YouTube, the current `hideNativeChat()` sets `display: none` on `ytd-live-chat-frame` but does not prevent YouTube's Polymer/LitElement from re-rendering it later. YouTube's SPA router re-creates `ytd-live-chat-frame` from scratch on navigation, which means `display: none` is lost and the element reappears. The hide-style approach from Twitch is more durable.

**Why it happens:**
Both platforms are React/Polymer SPAs. DOM mutation is their normal operation. Any broad `subtree: true` observer on these pages fires thousands of times per second during heavy chat activity.

**Consequences:**
- Reinit loop: init() called repeatedly, creating and destroying iframes in quick succession. Each init call triggers a new `CONNECT_WEBSOCKET` message to the service worker, potentially creating parallel WebSocket connections.
- Performance: `subtree: true` on `document.body` is the most expensive MutationObserver configuration possible on a complex SPA. At 60fps with active chat, this can block the main thread.

**Prevention:**
- Scope MutationObserver to the smallest possible DOM subtree. Observe the right-column container, not `document.body`.
- After slot injection, the observer's only job is to detect if _our_ container was removed. Change the target to the slot's parent element specifically.
- Add a debounce guard that checks `Date.now() - lastInitTime < MIN_REINIT_INTERVAL` before calling `init()`. The current 500ms debounce is insufficient; use 2000ms minimum.
- For YouTube: prefer injecting a `<style>` rule targeting `ytd-live-chat-frame` (same approach as Twitch's `hideNativeChat`) over inline `style.display = 'none'`, which is lost on element recreation.

**Detection:** Console shows `[AllChat] Detected re-render, re-injecting...` more than once per 5 seconds during normal browsing.

**Phase:** DOM slot injection migration (Phase 1).

---

### Pitfall 3: Tailwind 4 CSS-First Config Is Fundamentally Incompatible with the Current Build Setup

**What goes wrong:**
The project currently uses Tailwind 3.4.1 with a `tailwind.config.js` JS file and `postcss-loader` in webpack. Tailwind 4 removes the JS config entirely — configuration moves into the CSS file using `@theme` directives. This means `tailwind.config.js` is silently ignored by Tailwind 4. The project would appear to build successfully, but none of the `theme.extend` customizations would apply. The OkLCh color tokens (`--color-neutral-950` etc.) defined in `@theme {}` in a global CSS file would not be scanned by the iframe bundle's PostCSS pipeline unless that CSS file is explicitly imported.

More critically: Tailwind 4 ships its own PostCSS plugin (`@tailwindcss/postcss`) to replace `tailwindcss` + `autoprefixer`. The current `postcss-loader` chain (`tailwindcss` → `autoprefixer`) produces no output with Tailwind 4 — it processes fine but generates no utility classes because the old plugin does not understand Tailwind 4's CSS-first approach. The build produces an empty/minimal CSS bundle silently.

**Why it happens:**
The `tailwind.config.js` file still exists at project root. Tailwind 4 skips it. No error is thrown. `npm run build` succeeds. The extension loads. All Tailwind classes in JSX are silently stripped from output.

**Consequences:** All UI styling disappears. The chat iframe renders unstyled HTML.

**Prevention:**
- Do not upgrade to Tailwind 4 incrementally. Treat it as a full replacement: remove `tailwind.config.js`, update `postcss.config.js` to use `@tailwindcss/postcss` only (no `autoprefixer` — Tailwind 4 includes it), add a single `@import "tailwindcss"` to the iframe's CSS entry point.
- Define all design tokens in `@theme {}` inside that same CSS entry point. Do not split across files unless you explicitly `@import` them.
- Validate the migration with a build smoke test: check that `dist/ui/chat-styles.css` contains utility class definitions, not just an empty file.

**Detection:** After upgrading, run `grep -c 'flex' dist/ui/chat-styles.css`. If result is 0, the PostCSS pipeline is not applying Tailwind 4.

**Phase:** Design system / Tailwind 4 migration (Phase 2).

---

### Pitfall 4: Tailwind 4 Design Tokens Leak from Iframe into Platform Page (or vice versa)

**What goes wrong:**
Tailwind 4 uses CSS custom properties registered at `:root` level inside `@theme {}`. When the iframe's CSS is injected into the page (not the iframe document), `:root` refers to the platform page's root. This does not apply here because the iframe uses `style-loader`, which injects `<style>` tags — but the injection target matters. If `style-loader` injects into `window.parent.document.head` instead of `document.head` (the iframe's own document), all `--color-*` tokens land on Twitch/YouTube's root, potentially overriding their own CSS variables with identical names.

The current build uses `style-loader` for all CSS. In a content script context, `style-loader` injects into the host page. In the iframe context (`chat-bundle.js`), it correctly injects into the iframe's own document — but only if webpack processes the iframe bundle independently. The webpack config has a single shared `css-loader` / `postcss-loader` rule applied to all entry points. A misconfiguration here could cause the iframe CSS to be injected into the wrong document.

**Why it happens:**
`style-loader` determines inject target at bundle load time based on `document`. If a content script imports CSS (even transitively), that CSS is injected into the host page. The iframe bundle must remain fully isolated from content script bundles.

**Consequences:** Platform page styles broken. CSS variables collide. Twitch chat UI shifts or disappears. This is nearly impossible to debug from inside the extension.

**Prevention:**
- Keep the iframe CSS bundle (`ui/chat-bundle`) strictly separate from content script bundles. Never import CSS from a shared module that is also imported by a content script.
- Validate after build: `grep 'color-neutral' dist/content-scripts/twitch.js` should return nothing. CSS tokens must only appear in `dist/ui/chat-bundle.js` or `dist/ui/chat-styles.css`.
- Consider using `MiniCssExtractPlugin` for the iframe bundle to emit a standalone CSS file rather than relying on `style-loader` injection, which avoids the injection-target ambiguity entirely.

**Detection:** Open DevTools on Twitch, inspect `:root` computed styles. If `--color-neutral-950` appears there, the token leaked from the iframe CSS.

**Phase:** Design system / Tailwind 4 migration (Phase 2).

---

### Pitfall 5: Kick Content Script Missing from `manifest.json` and `web_accessible_resources`

**What goes wrong:**
The manifest currently has content scripts only for `twitch.tv` and `youtube.com`. Adding a `kick.ts` content script that is compiled by webpack but not declared in `manifest.json` means the script is never injected. The build succeeds. The extension loads. Kick pages load. Nothing happens. No error appears in the console because the content script simply never runs.

Additionally, `web_accessible_resources` currently only allows `ui/chat-container.html` on `twitch.tv` and `youtube.com`. The Kick content script calls `chrome.runtime.getURL('ui/chat-container.html')` to create the iframe `src`. If `kick.com` is not in the `web_accessible_resources` match list, this returns a valid URL but the browser refuses to load it inside the Kick origin — the iframe loads a blank page with no error in the extension's console (the error appears only in the page's devtools as a blocked resource).

**Why it happens:**
These are two separate, silent failure modes. Both are common when adding new platforms because they require coordinated changes across webpack config, manifest.json, and web_accessible_resources.

**Consequences:** Kick support silently non-functional. Takes significant debugging time to identify because no error is thrown.

**Prevention:**
A Kick platform addition requires changes to all five of these simultaneously:
1. `webpack.config.js` — new entry point `'content-scripts/kick': './src/content-scripts/kick.ts'`
2. `manifest.json` `content_scripts` — new match rule for `https://kick.com/*`
3. `manifest.json` `host_permissions` — add `https://kick.com/*`
4. `manifest.json` `web_accessible_resources` — add `https://kick.com/*` to matches
5. Auth integration — `/api/v1/auth/viewer/kick/login` endpoint must exist on the backend

Create a checklist item in the Kick phase task that explicitly lists all 5 locations.

**Detection:** Open `chrome://extensions`, click "Inspect views: service worker". If `content-scripts/kick.js` does not appear in the Sources panel when on kick.com, the manifest entry is missing.

**Phase:** Kick platform support (Phase 3).

---

### Pitfall 6: LLM-Agent Tests Make Assertions About Live Platform State (Flaky by Design)

**What goes wrong:**
The existing `test-streamer-switch.spec.ts` navigates to real Twitch pages (`twitch.tv/caesarlp`, `twitch.tv/pokimane`) and uses `test.skip()` if the streamer is not live or not configured in All-Chat. An LLM-agent test that asks the agent to "verify the chat is working" against a live stream will produce different results depending on: whether the stream is live, whether the backend has that streamer configured, network latency, Twitch's current DOM structure, and rate limiting on the All-Chat API. This makes tests non-deterministic and not useful for CI.

LLM agent frameworks (e.g., Claude computer-use, browser-use, Anthropic's agent API) require an API call per agent action. If an agent test navigates to a real live stream and the stream takes 5 seconds to load, then the iframe injection takes 1 second, then the agent takes 3 API calls to make an assertion — the test costs ~$0.05–0.20 per run and takes 30–90 seconds. In CI, this is unacceptable.

**Why it happens:**
Extension testing against real platforms is the most accurate test but the least stable. The LLM-agent approach amplifies both cost and latency of any real-network dependency.

**Consequences:** Tests that pass on Monday fail on Wednesday because a streamer went offline. CI becomes unreliable. Test suite is abandoned.

**Prevention:**
- Use fixture pages (local HTML files served by a test server) that replicate the platform's DOM structure for the relevant chat container selector — not a full Twitch clone, just enough DOM that the content script's `getChatContainerSelector()` matches. The Twitch detector only needs `[data-test-selector="chat-scrollable-area"]` or `div[role="log"]` to be present.
- Use `page.route()` in Playwright to intercept `allch.at` API calls and return mock streamer data — this already works in the existing test setup.
- Reserve LLM-agent tests for visual regression and UX flows where human-like perception adds value (e.g., "does the chat look broken after styling changes"). Use conventional Playwright assertions for structural correctness.
- Keep LLM-agent tests in a separate suite (`tests/agent/`) that is excluded from CI by default and run manually or on release branches only.

**Detection:** CI test run time exceeds 5 minutes, or test failure rate exceeds 20% across runs on unchanged code.

**Phase:** LLM-agent test infrastructure (Phase 4).

---

## Moderate Pitfalls

---

### Pitfall 7: Service Worker Killed During Iframe `postMessage` Relay

**What goes wrong:**
MV3 service workers are terminated after ~30 seconds of inactivity. The content script's `setupGlobalMessageRelay()` registers a `chrome.runtime.onMessage` listener at load time. If the service worker is terminated between the content script's listener registration and a `WS_MESSAGE` event, the service worker restarts on the next message — but the content script's `onMessage` listener is already registered and waiting. The race condition is: service worker restarts, broadcasts `CONNECTION_STATE`, content script relays to iframe. This works. However, if the service worker restarts while a chat message is mid-flight, the `WebSocket` instance it owns is destroyed and must reconnect. The content script does not know the WebSocket was lost until it receives a `CONNECTION_STATE: disconnected` message from the restarted service worker. The iframe continues showing the last `connected` state.

**Prevention:**
- The iframe should treat absence of `WS_MESSAGE` events for more than 60 seconds as a likely connectivity issue and show a soft "reconnecting" indicator. Do not rely on `CONNECTION_STATE` being the only source of truth for connection health.
- The existing backoff reconnect in the service worker handles this, but the UI feedback path (service worker → content script → iframe) has no timeout safety net.

**Phase:** Service worker robustness, overlaps with any phase that changes the connection flow.

---

### Pitfall 8: `postMessage` with `targetOrigin: '*'` Accepts Messages from Kick's Own Iframes

**What goes wrong:**
Kick embeds third-party chat and player iframes on its stream pages. The content script's `window.addEventListener('message', ...)` accepts messages from any origin (`event.origin` is not validated — documented in `CONCERNS.md` as a known security issue). When the Kick content script is added, the number of iframe-sourced messages on the page increases (Kick has more embedded frames than Twitch). A rogue or compromised iframe on the Kick page could send a `GET_CONNECTION_STATE` message to the content script and receive the WebSocket state in response.

**Prevention:**
Before adding Kick support, fix the `event.origin` validation in the base `PlatformDetector` message listener. The correct origin to validate against is `chrome.runtime.getURL('')` (the extension's own origin). This is a one-line fix that prevents the entire class of cross-frame injection attacks.

**Phase:** Kick platform support (Phase 3) — fix must precede Kick launch.

---

### Pitfall 9: YouTube `ytd-live-chat-frame` Is Replaced (Not Mutated) on Navigation

**What goes wrong:**
The current `hideNativeChat()` for YouTube calls `chatFrame.style.display = 'none'` on the `ytd-live-chat-frame` element found at injection time. YouTube's SPA navigation between videos destroys and recreates the entire `ytd-live-chat-frame` element — inline styles on the old element are gone. On the new page, native chat is visible alongside the all-chat container (which survived because it was appended to the parent, not inside the destroyed element).

The URL watcher re-calls `init()` after navigation, which calls `hideNativeChat()` again — but only after `YOUTUBE_INIT_DELAY` (2000ms). During those 2 seconds, both native chat and the old all-chat container are visible simultaneously.

**Prevention:**
- Prefer the CSS-injection approach used by Twitch (`<style id="allchat-hide-native-style">`) over per-element inline styles. A `<style>` tag injected into `document.head` survives element recreation.
- Reduce or eliminate the fixed delay. Use a `MutationObserver` that watches for `ytd-live-chat-frame` to appear, then immediately hide it and inject.
- In `removeAllChatUI()`, also remove the injected `<style>` tag to restore native chat correctly on disable.

**Phase:** YouTube completion (Phase 1 / Phase 3).

---

### Pitfall 10: Kick DOM Structure Is Undocumented and Changes Frequently

**What goes wrong:**
Kick is a newer platform with a less stable front-end than Twitch or YouTube. The chat container DOM structure has changed multiple times since Kick's 2022 launch. Unlike Twitch, which exposes `data-test-selector` and `data-a-target` attributes (relatively stable semver-like contracts), Kick's chat uses generated class names with no stable attributes. The selectors discovered during development may break within weeks of the platform's next deploy.

**Prevention:**
- Use the most structural selector available: element type + ARIA role (e.g., `[role="log"]` inside `#chatroom`). Avoid generated class names entirely.
- Document the selectors used at the time of implementation with a comment noting the Kick version/date observed, so future breakage is immediately attributable.
- The Kick selector fallback chain should be longer than Twitch's (at least 4–5 levels), and the MutationObserver reinit should be more aggressive on Kick than on Twitch.
- Treat Kick selector maintenance as ongoing work, not a one-time implementation task.

**Phase:** Kick platform support (Phase 3).

---

### Pitfall 11: Webpack 5 Has No Native Tailwind 4 Integration — Build Output Not Split Correctly

**What goes wrong:**
Tailwind 4 recommends Vite (via `@tailwindcss/vite`) as its primary bundler. The webpack plugin (`@tailwindcss/postcss`) is supported but is a secondary path. Webpack 5 with `postcss-loader` processes CSS synchronously in the module pipeline. Tailwind 4's `@import "tailwindcss"` expands into a large virtual module at PostCSS time. With the current webpack config using `style-loader` (runtime CSS injection), the Tailwind utilities end up inside `chat-bundle.js` as a string injected via `<style>`. This significantly inflates the JS bundle size compared to a separate CSS file.

More concretely: the current `webpack.config.js` has `inject: false` for `chat-container.html`, meaning CSS must be manually referenced in the HTML template. If the migration to Tailwind 4 switches to `MiniCssExtractPlugin` for CSS extraction (the right approach), the extracted CSS filename must be added to `chat-container.html` explicitly, or the iframe loads with no styles.

**Prevention:**
- When migrating to Tailwind 4, switch the iframe CSS pipeline from `style-loader` to `MiniCssExtractPlugin`. Update `chat-container.html` to include `<link rel="stylesheet" href="chat-styles.css">`.
- Run a post-build check: `ls -la dist/ui/` should show a separate `chat-styles.css` file with non-trivial size.
- Do not switch the content script CSS pipeline to `MiniCssExtractPlugin` — content scripts should still use `style-loader` (or inject via `hideNativeChat` approach) so that the CSS applies to the correct document.

**Phase:** Design system / Tailwind 4 migration (Phase 2).

---

## Minor Pitfalls

---

### Pitfall 12: Resizable Panel Width Stored in `localStorage` Clashes with `chrome.storage`

**What goes wrong:**
The planned resizable chat panel will need to persist its width. Storing it in the iframe's `window.localStorage` is natural from React but the iframe origin is `chrome-extension://...` — localStorage here is per-extension-origin, not per-platform. This is fine for persistence, but `getSyncStorage` / `getLocalStorage` patterns used elsewhere in the project all go through `chrome.storage`. Mixing `localStorage` and `chrome.storage` for UI state creates two sources of truth that get out of sync between extension reinstalls.

**Prevention:** Store panel width in `chrome.storage.local` via the content script relay, not in iframe's `window.localStorage`.

**Phase:** Resizable panel feature.

---

### Pitfall 13: `TWITCH_INIT_DELAY` / `YOUTUBE_INIT_DELAY` Are Wrong After Slot Migration

**What goes wrong:**
The fixed delays (1000ms for Twitch, 2000ms for YouTube) exist because the fixed-position overlay architecture needed to wait for Twitch React to render the right column before injecting. After slot injection, the injection point _is_ the native chat element — which can be detected via MutationObserver as soon as it appears, with zero artificial delay. Keeping the delays post-migration wastes time on every stream load and creates the race condition window described in Pitfall 9.

**Prevention:** After slot injection is implemented, remove the fixed delays. Replace them with a `Promise` that resolves when `MutationObserver` fires on the target selector appearing.

**Phase:** DOM slot injection migration (Phase 1).

---

### Pitfall 14: LLM Agent Cannot Interact with `position: fixed` Elements Inside an Iframe

**What goes wrong:**
LLM-agent frameworks that use screenshot-based navigation (Claude computer-use, GPT-4o with browser) take a screenshot of the visible viewport. An iframe whose content is scrollable but whose host element is smaller than the viewport means the agent sees the chat container but cannot scroll inside it — only the outer page scroll is visible to the agent's viewport tool.

For the current fixed-position overlay architecture, `position: fixed` on `#allchat-container` means it is always in the viewport, but the iframe content (the React app) is inside an `<iframe>` element. The agent can see the chat visually but cannot use standard Playwright locators to interact with elements inside cross-origin iframes. After slot migration, the iframe is in the DOM flow, making it more accessible to Playwright's `frameLocator()` API.

**Prevention:**
- Use `page.frameLocator('iframe[data-platform]')` for all agent-driven interactions inside the chat iframe.
- Provide the LLM agent with explicit context that the chat UI is inside an iframe (include this in the system prompt / agent instructions).
- After slot injection is complete, validate that `page.frameLocator('iframe[data-platform="twitch"]').locator('.chat-message')` returns elements before writing agent tests.

**Phase:** LLM-agent test infrastructure (Phase 4), depends on Phase 1 slot migration.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Twitch DOM slot injection | Fixed-position overlay code path survives migration (Pitfall 1) | Delete legacy `createInjectionPoint` body-append path entirely |
| Twitch DOM slot injection | MutationObserver reinit loop when native selector is no longer found (Pitfall 2) | Scope observer to slot parent, increase debounce to 2000ms |
| YouTube slot completion | `ytd-live-chat-frame` recreated on navigation, inline hide lost (Pitfall 9) | Switch to `<style>` tag injection, remove fixed YOUTUBE_INIT_DELAY (Pitfall 13) |
| Design system / Tailwind 4 | JS config silently ignored, CSS bundle empty (Pitfall 3) | Replace postcss chain, validate `dist/ui/chat-styles.css` has content |
| Design system / Tailwind 4 | CSS tokens leak to platform page via wrong style-loader target (Pitfall 4) | Use MiniCssExtractPlugin for iframe bundle, audit `dist/content-scripts/*.js` |
| Design system / Tailwind 4 | Webpack 5 + Tailwind 4 CSS extraction not wired to HTML template (Pitfall 11) | Update `chat-container.html` with explicit CSS link |
| Kick platform support | All 5 manifest/config locations must be updated atomically (Pitfall 5) | Use a multi-location checklist for the Kick PR |
| Kick platform support | `postMessage` origin validation missing before Kick adds more iframes (Pitfall 8) | Fix origin validation in base class before shipping Kick |
| Kick platform support | Kick DOM selectors are unstable, no stable data attributes (Pitfall 10) | Use ARIA role selectors only, document selectors with date observed |
| LLM-agent tests | Real platform dependencies make tests non-deterministic (Pitfall 6) | Use fixture pages + `page.route()` mocking, exclude from CI |
| LLM-agent tests | Agent cannot interact with iframe content without `frameLocator` (Pitfall 14) | Validate `frameLocator` access post-slot-migration before writing agent tests |

---

## Sources

All findings derived from direct code analysis of:
- `src/content-scripts/twitch.ts` — overlay implementation, MutationObserver, duplicate container guard
- `src/content-scripts/youtube.ts` — inline hide approach, fixed delay, SPA nav handling
- `src/content-scripts/base/PlatformDetector.ts` — `*` targetOrigin in postMessage relay
- `manifest.json` — missing Kick entries, web_accessible_resources scope
- `webpack.config.js` — style-loader for all CSS, inject:false in HtmlWebpackPlugin
- `tailwind.config.js` — JS config format (Tailwind 3 only)
- `.planning/codebase/CONCERNS.md` — documented bugs: duplicate container, observer fragility, postMessage origin, YouTube detection brittleness
- `.planning/codebase/TESTING.md` — single-worker, non-headless, no mocking
- `tests/test-streamer-switch.spec.ts` — real-network dependency, `test.skip()` on missing streamer
- `playwright.config.ts` — headless: false, no fixture server configured
