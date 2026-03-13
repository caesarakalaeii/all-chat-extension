# Phase 3: Kick Platform - Research

**Researched:** 2026-03-12
**Domain:** Chrome Extension content script — Kick.com platform integration, postMessage security hardening
**Confidence:** MEDIUM (core Chrome extension patterns HIGH; Kick.com DOM selectors LOW — manual verification required)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Content script runs on `kick.com/*` (via manifest match) but only injects if a live stream is confirmed
- Live stream detection is two-tier: (1) look for a live badge element, (2) if no badge, check if chat slot exists and is visible — if neither found, do nothing and emit `console.warn`
- Same `isLiveStream()` override pattern as `YouTubeDetector` — Kick needs its own check
- The plan must include a CHECKPOINT task as the first item: manually load a live Kick stream, confirm selectors in DevTools, update the KICK-07 date-comment with confirmed selector
- Execution of the injection plan is blocked until the checkpoint is confirmed
- Selector fallback chain: primary `#channel-chatroom`, fallback 1 `#chatroom`, fallback 2 `.chatroom-wrapper`; include date-comment on each entry
- SPA navigation via `popstate` + `pushState` intercept (monkey-patch approach)
- Same deduplication approach as YouTube: compare `location.href` before and after
- postMessage hardening: both sides locked down — content script uses extension URL as targetOrigin, iframe listener adds origin guard
- Origin whitelist: extension origin only — no `allch.at`, no platform origins
- postMessage hardening implemented as a separate Wave 1 plan that runs before the Kick injection plan (Wave 2)

### Claude's Discretion

- Exact live badge selector on Kick (e.g., `.live-badge`, `[data-state="live"]`, etc.) — researcher should investigate current Kick DOM
- Whether to wrap `history.pushState` monkey-patch in a try/catch or let it fail loudly
- Exact `chrome.runtime.getURL('')` trimming to derive the extension origin string

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KICK-01 | `kick.ts` content script detects live stream on kick.com via URL pattern and DOM state | `isLiveStream()` pattern from YouTubeDetector; live badge selector investigation; two-tier detection approach |
| KICK-02 | Kick chat iframe mounted in `#channel-chatroom` slot (native chat hidden) | `createInjectionPoint()` and `hideNativeChat()` patterns from existing detectors; selector fallback chain |
| KICK-03 | `manifest.json` updated with Kick `content_scripts`, `host_permissions`, and `web_accessible_resources` entries | Exact manifest diff documented in Architecture Patterns |
| KICK-04 | Webpack entry added for `content-scripts/kick` | Exact webpack entry pattern from existing config |
| KICK-05 | `postMessage` origin validation in `PlatformDetector` base class fixed before Kick ships | `chrome.runtime.getURL('')` origin derivation; both-sides validation pattern |
| KICK-06 | Kick SPA navigation handled via `popstate` + `pushState` intercept | Isolated world limitation requires script injection to main world; alternatives documented |
| KICK-07 | Kick selector fallback chain in place (`#channel-chatroom` → `#chatroom` → `.chatroom-wrapper`) with date-comment | Fallback chain pattern matches `getChatContainerSelector()` in base class; date-comment format established |
</phase_requirements>

---

## Summary

Phase 3 adds Kick.com as a third supported platform using the same `PlatformDetector` class hierarchy already established in Phases 1 and 2. The implementation divides into two waves: Wave 1 hardens `postMessage` origin validation across all three platforms (a cross-cutting security fix required before Kick ships because Kick embeds more third-party iframes); Wave 2 implements the Kick content script, manifest entries, and webpack wiring.

The most significant unknown is the Kick.com DOM structure. Kick runs on Next.js and its chatroom selectors (`#channel-chatroom`, `#chatroom`, `.chatroom-wrapper`) and live badge selector have NOT been verified against a live page — the plan must begin with a manual checkpoint. The SPA navigation approach also requires care: monkey-patching `history.pushState` from an isolated content script world does not affect the page's actual `pushState`, so an alternative strategy (MutationObserver on URL, or `webNavigation` API, or injected inline script) must be used instead.

The `postMessage` hardening is well-understood. `chrome.runtime.getURL('')` returns `chrome-extension://<id>/`, and slicing off the trailing slash gives the exact origin string (`chrome-extension://<id>`) needed for both `targetOrigin` in `postMessage()` calls and `event.origin` validation in the iframe listener.

**Primary recommendation:** Execute Wave 1 (postMessage fix) first, verify Twitch and YouTube still work, then proceed to Wave 2 (Kick content script) gated on the manual DOM checkpoint.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Chrome Extension MV3 | Manifest v3 | Extension runtime | Already in use; all APIs available |
| TypeScript | ^5.3.3 | Content script language | Already in use across all content scripts |
| Webpack 5 | ^5.89.0 | Build + bundle | Already configured with entry-per-platform pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Playwright | ^1.57.0 | Integration tests | Existing test framework for all platform tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MutationObserver URL-change polling (Twitch approach) | `pushState` intercept | pushState intercept is more precise but requires main-world script injection; MutationObserver is simpler but fires for every DOM change |
| MutationObserver URL-change polling | `chrome.webNavigation.onHistoryStateUpdated` | webNavigation is clean but requires adding a new permission to manifest |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure
```
src/content-scripts/
├── base/
│   └── PlatformDetector.ts   # Already exists; no changes for Kick itself
├── twitch.ts                 # Wave 1: update postMessage targetOrigin
├── youtube.ts                # Wave 1: update postMessage targetOrigin
└── kick.ts                   # Wave 2: new file
src/ui/
└── index.tsx                 # Wave 1: add origin guard to message listener
manifest.json                 # Wave 2: add Kick entries
webpack.config.js             # Wave 2: add kick entry
```

### Pattern 1: KickDetector Class Structure

**What:** `KickDetector extends PlatformDetector` — mirrors YouTubeDetector structure with a `isLiveStream()` override before calling `super.init()`

**When to use:** KickDetector is the standard entry point; `kick.ts` instantiates it.

```typescript
// Mirrors YouTubeDetector pattern — src/content-scripts/kick.ts
class KickDetector extends PlatformDetector {
  platform = 'kick' as const;

  isLiveStream(): boolean {
    // Primary: live badge element (selector TBD at checkpoint — 2026-03-12)
    const liveBadge = document.querySelector('.live-badge, [data-state="live"]');
    if (liveBadge) return true;

    // Fallback: chat slot exists and is visible
    const chatSlot = document.querySelector(
      '#channel-chatroom, #chatroom, .chatroom-wrapper'
    ) as HTMLElement | null;
    if (chatSlot && chatSlot.offsetParent !== null) return true;

    console.warn('[AllChat Kick] No live signal found, not injecting');
    return false;
  }

  async init(): Promise<void> {
    if (!this.isLiveStream()) return;
    return super.init();
  }

  // ... remaining abstract methods
}
```

### Pattern 2: Manifest Additions

**What:** Three manifest sections need Kick entries.

**When to use:** Required for extension to load on kick.com at all (KICK-03).

```json
// manifest.json additions
"host_permissions": [
  "https://www.twitch.tv/*",
  "https://www.youtube.com/*",
  "https://kick.com/*",            // ADD
  "http://localhost:8080/*",
  "https://allch.at/*"
],

"content_scripts": [
  // ... existing twitch and youtube entries ...
  {
    "matches": ["https://kick.com/*"],
    "js": ["content-scripts/kick.js"],
    "css": ["content-scripts/styles.css"],
    "run_at": "document_idle"
  }
],

"web_accessible_resources": [
  {
    "resources": ["ui/chat-container.html", "ui/chat-bundle.js", "ui/chat-styles.css", "assets/*"],
    "matches": [
      "https://www.twitch.tv/*",
      "https://www.youtube.com/*",
      "https://kick.com/*"           // ADD
    ]
  }
]
```

### Pattern 3: Webpack Entry Addition

**What:** One line addition to `webpack.config.js` entry object.

```javascript
// webpack.config.js entry additions
entry: {
  'background': './src/background/service-worker.ts',
  'content-scripts/twitch': './src/content-scripts/twitch.ts',
  'content-scripts/youtube': './src/content-scripts/youtube.ts',
  'content-scripts/kick': './src/content-scripts/kick.ts',   // ADD
  'ui/chat-bundle': './src/ui/index.tsx',
  'popup/popup': './src/popup/popup.tsx'
},
```

### Pattern 4: postMessage Origin Hardening

**What:** Lock both ends of the `postMessage` channel to the extension origin.

**When to use:** Wave 1 — applied to all three content scripts and the iframe listener.

```typescript
// Content script side (twitch.ts, youtube.ts, kick.ts)
// Derive extension origin from chrome.runtime.getURL('')
// chrome.runtime.getURL('') returns "chrome-extension://<id>/"
// Slice trailing slash to get the origin string
const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
// "chrome-extension://<id>"

// Send to iframe — replace '*' with extensionOrigin
iframe.contentWindow?.postMessage(data, extensionOrigin);

// Relay in message relay — replace '*' with extensionOrigin
iframeElement.contentWindow?.postMessage(message, extensionOrigin);
```

```typescript
// Iframe listener side (src/ui/index.tsx)
window.addEventListener('message', (event) => {
  // Guard: only accept messages from the extension itself
  const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
  if (event.origin !== extensionOrigin) return;

  if (event.data.type === 'ALLCHAT_INIT') {
    // ... existing handling
  }
});
```

**Key detail:** `chrome.runtime.getURL('')` is available in both content scripts and extension pages (iframes) because the iframe src is `chrome-extension://…/ui/chat-container.html`. The `chrome` namespace is available in all extension contexts. This is confirmed HIGH confidence — MV3 extension iframes are extension contexts with full `chrome.*` API access.

### Pattern 5: SPA Navigation — MutationObserver (Recommended)

**What:** The locked decision specifies `popstate` + `pushState` intercept. However, monkey-patching `history.pushState` from an isolated content script world does NOT affect the page's actual `pushState` — the patch only applies to the content script's sandboxed copy.

**Resolution:** Two viable approaches:

**Option A (Recommended): MutationObserver on `document.title` or body attribute** — same approach as Twitch's URL-change detection via MutationObserver. Kick's Next.js router updates the document title on navigation, making this reliable. Simpler and requires no main-world script injection.

```typescript
// src/content-scripts/kick.ts — SPA navigation
function setupUrlWatcher(): void {
  let activeUrl = location.href;

  const handleNavigation = () => {
    const url = location.href;
    if (url === activeUrl) return;
    activeUrl = url;
    console.log('[AllChat Kick] Navigation detected, tearing down...');
    globalDetector?.teardown();
    if (globalDetector?.isLiveStream()) {
      globalDetector.init();
    }
  };

  // popstate handles back/forward
  window.addEventListener('popstate', handleNavigation);

  // MutationObserver on document.title for pushState navigation
  // (Next.js updates title on route change)
  new MutationObserver(handleNavigation).observe(
    document.querySelector('title') || document.head,
    { childList: true, characterData: true, subtree: true }
  );
}
```

**Option B: Inject inline script to main world** — injects a `<script>` tag that monkey-patches `pushState` in the page's main world and dispatches a `CustomEvent`. The content script listens for the custom event. This is the canonical solution but requires `world: "MAIN"` in manifest content_scripts or dynamic script injection, which adds complexity.

**Decision for planner:** Use Option A (MutationObserver on title) — it matches the existing Twitch MutationObserver pattern, avoids main-world injection complexity, and is sufficient for Kick's navigation pattern.

### Anti-Patterns to Avoid

- **Monkey-patching `history.pushState` directly in content script code:** Content scripts run in an isolated world — the patch only affects the content script's scope, not the page. The page's `pushState` is never overridden.
- **Using `'*'` as postMessage targetOrigin in the relaying functions:** The intent of KICK-05 is to remove all `'*'` usages. There are multiple relay sites — `injectAllChatUI` in `PlatformDetector.ts` and the `setupGlobalMessageRelay` function in each content script.
- **Detecting Kick live streams by URL alone:** Kick channel pages exist for offline streamers too. URL pattern `kick.com/<username>` does not guarantee a live stream is active.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Waiting for Kick DOM to settle | Custom delay/sleep | `this.waitForElement(selector)` | Already implemented in `PlatformDetector` with 200ms pre-delay + 100ms poll + 10s timeout |
| Hiding native chat | `element.style.display = 'none'` | Injected `<style id="allchat-hide-native-style">` | Inline styles are overwritten by framework re-renders; style tag persists (established pattern from Twitch + YouTube) |
| Extension ID in postMessage origin | Hardcode extension ID string | `chrome.runtime.getURL('').slice(0, -1)` | Extension ID changes between development installs; getURL is always correct |
| Detecting SPA navigation | setInterval URL polling | MutationObserver on title element | setInterval fires constantly even with no navigation; MutationObserver is event-driven |

**Key insight:** The `PlatformDetector` base class already provides all shared utilities. `KickDetector` should override only what is Kick-specific and delegate everything else to `super`.

---

## Common Pitfalls

### Pitfall 1: Kick Uses `kick.com` (no `www.`)
**What goes wrong:** Content script match pattern `https://www.kick.com/*` fails to load on actual Kick URLs (`https://kick.com/username`).
**Why it happens:** Kick does not use a `www` subdomain. Twitch and YouTube both use `www.` — copying their manifest entries directly gives the wrong hostname.
**How to avoid:** Match pattern must be `https://kick.com/*` (no `www`).
**Warning signs:** Extension doesn't load on kick.com at all; no console output from content script.

### Pitfall 2: postMessage to Multiple `contentWindow`s
**What goes wrong:** postMessage hardening breaks the relay if `extensionOrigin` is computed once at module load time, but the iframe src hasn't loaded yet and `chrome.runtime.getURL` returns an unexpected value.
**Why it happens:** `chrome.runtime.getURL('')` is synchronous and available immediately — this is not actually a timing issue. The real pitfall is forgetting to update BOTH the `injectAllChatUI` call in `PlatformDetector.ts` AND the `setupGlobalMessageRelay` relay in each content script file. There are two send-sites per file.
**How to avoid:** Search for all `postMessage(` usages across `PlatformDetector.ts`, `twitch.ts`, and `youtube.ts` before implementing Wave 1.
**Warning signs:** Chat initializes but WS_MESSAGE relays fail; CONNECTION_STATE updates not received.

### Pitfall 3: `isLiveStream()` False Negative on Late DOM Load
**What goes wrong:** `isLiveStream()` returns `false` because the live badge hasn't rendered yet when the content script fires at `document_idle`.
**Why it happens:** Kick is a Next.js SPA. `document_idle` fires when the initial HTML is parsed, but Next.js hydration can render the live badge asynchronously after that.
**How to avoid:** The fallback check (chat slot exists + `offsetParent !== null`) covers this case — if Next.js has rendered enough DOM to show the chat, that is sufficient evidence of a live stream.
**Warning signs:** Extension works when page is refreshed mid-stream but not when navigating from Kick homepage.

### Pitfall 4: SPA Navigation Double-Init
**What goes wrong:** Navigation fires both `popstate` and the MutationObserver callback for the same URL change, triggering `init()` twice.
**Why it happens:** Same deduplication problem as YouTube (which fires both `yt-navigate-finish` and `popstate`).
**How to avoid:** Always gate navigation handling on `if (url === activeUrl) return;` before updating `activeUrl`.
**Warning signs:** Two `[AllChat Kick] Initializing...` log lines per navigation; two `#allchat-container` divs.

### Pitfall 5: Kick `host_permissions` URL Format
**What goes wrong:** Using `https://kick.com/*` in `host_permissions` but `https://www.kick.com/*` in `content_scripts.matches` (or vice versa) leaves the extension partially broken.
**Why it happens:** Copy-paste inconsistency. Both sections must use the exact same origin.
**How to avoid:** Both `host_permissions` and `content_scripts.matches` must use `https://kick.com/*`. Also add `kick.com/*` (no trailing slash, no scheme) to `web_accessible_resources.matches` — the WAR entry uses a different format.

---

## Code Examples

Verified patterns from existing codebase:

### Origin derivation for postMessage (KICK-05)
```typescript
// Both content script send-sites and iframe receive-side
// chrome.runtime.getURL('') → "chrome-extension://<extension-id>/"
// Slice the trailing slash to get a valid origin string
const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
// Result: "chrome-extension://<extension-id>"
```

**Confidence:** HIGH — `chrome.runtime.getURL` behavior is documented and tested. Extension iframes (loaded via `chrome-extension://` URL) have full `chrome.*` API access and can call `chrome.runtime.getURL` directly.

### Existing `hideNativeChat()` pattern (KICK-02)
```typescript
// Matches the established style-tag pattern from twitch.ts and youtube.ts
hideNativeChat(): void {
  if (document.getElementById('allchat-hide-native-style')) return; // idempotent

  const style = document.createElement('style');
  style.id = 'allchat-hide-native-style';
  // Selector TBD at KICK-07 checkpoint — 2026-03-12
  style.textContent = `#channel-chatroom { display: none !important; }`;
  document.head.appendChild(style);
}
```

### Existing `createInjectionPoint()` pattern (KICK-02)
```typescript
// Mirrors YouTubeDetector: wait for slot, insert container before/inside it
async createInjectionPoint(): Promise<HTMLElement | null> {
  try {
    // Primary selector — KICK-07 fallback chain
    let slot: HTMLElement | null = null;
    for (const sel of ['#channel-chatroom', '#chatroom', '.chatroom-wrapper']) {
      try { slot = await this.waitForElement(sel); break; } catch { /* try next */ }
    }
    if (!slot) {
      console.warn('[AllChat Kick] No chat slot found — native chat remains visible');
      return null;
    }
    const container = document.createElement('div');
    container.id = 'allchat-container';
    container.style.cssText = 'width: 100%; height: 100%;';
    slot.appendChild(container);
    return container;
  } catch {
    console.warn('[AllChat Kick] Injection failed');
    return null;
  }
}
```

### postMessage targetOrigin update (KICK-05 — both send sites)
```typescript
// Site 1: injectAllChatUI in PlatformDetector.ts (line ~189)
// BEFORE: iframe.contentWindow?.postMessage(data, '*')
// AFTER:
const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
iframe.contentWindow?.postMessage(data, extensionOrigin);

// Site 2: setupGlobalMessageRelay relay in each content script (twitch.ts, youtube.ts)
// BEFORE: iframeElement.contentWindow?.postMessage(message, '*')
// AFTER:
const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
iframeElement.contentWindow?.postMessage(message, extensionOrigin);
```

### Origin guard in iframe listener (KICK-05 — src/ui/index.tsx)
```typescript
// BEFORE (line 18): window.addEventListener('message', (event) => {
// AFTER:
window.addEventListener('message', (event) => {
  const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
  if (event.origin !== extensionOrigin) return;
  // ... existing handling
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pushState` monkey-patch in content script | MutationObserver on title / body | N/A (pitfall, not evolution) | Content scripts run in isolated world; pushState patch never reaches page main world |
| `postMessage(data, '*')` | `postMessage(data, extensionOrigin)` | Phase 3 Wave 1 | Closes XSS vector where any page iframe could send spoofed ALLCHAT_INIT |
| MutationObserver on `document` with subtree (Twitch) | MutationObserver on specific element or title | Phase 3 | Scoped observer fires fewer times; less noisy |

**Deprecated/outdated:**
- `postMessage(*, '*')` wildcard: insecure for extension-to-iframe messaging; replaced in Wave 1

---

## Open Questions

1. **Kick live badge selector**
   - What we know: Kick shows a "LIVE" indicator on channel pages when streaming; common patterns are `.live-badge`, `[data-state="live"]`, `span:contains("LIVE")`, attribute-based selectors
   - What's unclear: Kick's Next.js DOM uses dynamic class names; the exact stable selector is unknown without inspecting a live page
   - Recommendation: The CHECKPOINT task (Wave 2 Task 1) resolves this; the fallback detection (chat slot exists + visible) is the safety net

2. **Kick chatroom slot injection style (replace vs inject alongside)**
   - What we know: YouTube inserts `#allchat-container` as a sibling before `ytd-live-chat-frame`; Twitch appends inside `.chat-shell`; Kick's `#channel-chatroom` structure is unknown
   - What's unclear: Whether `#channel-chatroom` is the outer wrapper (like `.chat-shell`) or the native chat element itself
   - Recommendation: After the checkpoint confirms the selector, determine if `slot.appendChild(container)` (Twitch pattern) or `parent.insertBefore(container, slot)` (YouTube pattern) is correct

3. **`GET_CONNECTION_STATE` response path in iframe listener**
   - What we know: `src/ui/index.tsx` currently has no `GET_CONNECTION_STATE` handler (it's in the content scripts). The origin guard added in Wave 1 must not accidentally block `GET_CONNECTION_STATE` responses that may come from the content script
   - What's unclear: Whether `src/ui/index.tsx` needs a `GET_CONNECTION_STATE` listener at all (the content scripts handle this)
   - Recommendation: Audit all `window.addEventListener('message', ...)` handlers in `src/ui/index.tsx` before adding the origin guard — confirm only the ALLCHAT_INIT handler is present

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.57.0 |
| Config file | `playwright.config.ts` |
| Quick run command | `npx playwright test --project=chromium-extension` |
| Full suite command | `npx playwright test --project=chromium-extension` |

**Note:** No `test` script in `package.json`. Run Playwright directly via `npx playwright test`. All tests run headless=false per config; consider adding `--headed=false` for CI runs.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KICK-01 | Live stream detection returns true on live page, false on VOD/offline | unit (fixture) | `npx playwright test tests/test-kick-detection.spec.ts` | Wave 0 |
| KICK-02 | Kick chat iframe mounted in chat slot; native chat hidden | integration (fixture) | `npx playwright test tests/test-kick-injection.spec.ts` | Wave 0 |
| KICK-03 | Extension loads on kick.com without override (manifest check) | manual-only | N/A — requires live kick.com page | manual |
| KICK-04 | `content-scripts/kick.js` present in built dist | smoke | `ls dist/content-scripts/kick.js` (build check) | Wave 0 |
| KICK-05 | postMessage from content script uses extension origin; iframe rejects '*' messages | unit (fixture) | `npx playwright test tests/test-postmessage-origin.spec.ts` | Wave 0 |
| KICK-06 | SPA navigation triggers teardown and re-init | integration (fixture) | `npx playwright test tests/test-kick-spa-navigation.spec.ts` | Wave 0 |
| KICK-07 | Selector fallback chain: tries #channel-chatroom, falls back gracefully | unit (fixture) | `npx playwright test tests/test-kick-selector-fallback.spec.ts` | Wave 0 |

**KICK-03 is manual-only** because it requires the extension to load on a real live Kick.com stream — not testable via fixture HTML.

### Sampling Rate
- **Per task commit:** `npx playwright test tests/test-postmessage-origin.spec.ts` (Wave 1 gate) / `npx playwright test tests/test-kick-injection.spec.ts` (Wave 2 gate)
- **Per wave merge:** `npx playwright test --project=chromium-extension`
- **Phase gate:** Full suite green + manual KICK-03 verification before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test-kick-detection.spec.ts` — covers KICK-01
- [ ] `tests/test-kick-injection.spec.ts` — covers KICK-02
- [ ] `tests/test-postmessage-origin.spec.ts` — covers KICK-05 (regression on Twitch + YouTube)
- [ ] `tests/test-kick-spa-navigation.spec.ts` — covers KICK-06
- [ ] `tests/test-kick-selector-fallback.spec.ts` — covers KICK-07
- [ ] `tests/fixtures/kick-mock.html` — Kick fixture HTML for offline injection tests

---

## Sources

### Primary (HIGH confidence)
- Codebase: `src/content-scripts/base/PlatformDetector.ts` — base class implementation
- Codebase: `src/content-scripts/youtube.ts` — isLiveStream(), SPA navigation, postMessage patterns
- Codebase: `src/content-scripts/twitch.ts` — MutationObserver URL-change pattern, teardown pattern
- Codebase: `manifest.json` — exact current manifest structure
- Codebase: `webpack.config.js` — exact current webpack entry structure
- Codebase: `src/ui/index.tsx` — iframe message listener; origin guard insertion point
- [MDN Window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) — targetOrigin format, origin validation
- [Chrome Extension Content Scripts docs](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — isolated world behavior

### Secondary (MEDIUM confidence)
- [W3C WebExtensions Issue #78](https://github.com/w3c/webextensions/issues/78) — deprecation discussion for `postMessage(*, '*')` in extensions
- WebSearch: content script isolated world limitation for `history.pushState` monkey-patching

### Tertiary (LOW confidence)
- Kick.com DOM selectors (`#channel-chatroom`, live badge selector) — not verified against live page; blocked on manual checkpoint
- Kick as Next.js SPA — consistent with community reports but not officially confirmed; MutationObserver approach handles any SPA router

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing codebase patterns are authoritative
- Architecture (postMessage hardening): HIGH — `chrome.runtime.getURL` behavior is well-documented MV3 API
- Architecture (SPA navigation): MEDIUM — isolated world limitation is verified; exact approach for Kick TBD
- Kick DOM selectors: LOW — requires manual verification at checkpoint; fallback chain mitigates risk
- Pitfalls: HIGH (code-derived) / MEDIUM (Kick-specific behaviors)

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (Kick.com DOM may change with Next.js deployments — selector checkpoint always required)
