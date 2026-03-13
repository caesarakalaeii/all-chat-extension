# Phase 1: DOM Slot Injection - Research

**Researched:** 2026-03-12
**Domain:** Chrome Extension Content Scripts — DOM Slot Injection, MutationObserver, SPA Navigation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**waitForElement() utility**
- Extracted to `PlatformDetector` base class (INJ-07)
- Pre-delay before first check: ~200ms (gives SPA time for initial render)
- Poll interval: 100ms (checks 10x/sec — fast enough to feel instant, low CPU)
- Timeout: 10 seconds before giving up
- On timeout: do nothing (show native chat by default) + emit `console.warn` — no user-visible badge or indicator

**Slot not found — fallback behavior**
- If slot not found after timeout: native chat remains visible, `console.warn` is emitted
- No silent fallback to `document.body` append (INJ-02) — that code path is fully removed

**Twitch slot targeting**
- `waitForElement('.chat-shell')` only — no fallback selector chain (INJ-01, INJ-02)
- Wrapper div + iframe both sized `width: 100%; height: 100%` — trust `.chat-shell` to control dimensions, no hardcoded pixel values
- Still inject `<style>` tag to hide native Twitch chat elements inside the slot
- MutationObserver scoped to `.chat-shell`'s **parent** (`childList: true, subtree: false`) — detects if `.chat-shell` itself is removed; if so, re-run `waitForElement()` (INJ-03)
- Observer is stopped and restarted on each Twitch navigation (re-scoped to the new slot parent)

**YouTube slot targeting**
- Hide `ytd-live-chat-frame` via an injected `<style>` tag (not inline style) so Polymer recreation on navigation doesn't restore it (INJ-06)
- Insert `#allchat-container` in the same flex slot — before `ytd-live-chat-frame` in the DOM tree
- Same `waitForElement()` path as Twitch (200ms pre-delay, 100ms poll, 10s timeout)

**YouTube SPA navigation**
- Primary: `yt-navigate-finish` event on `window`
- Fallback: `popstate` event — whichever fires first triggers the re-initialization check (INJ-05)
- Listener registered once on `initialize()` — not re-registered after each navigation
- After each navigation: always call `isLiveStream()` to check current page state
  - If live: run `waitForElement()` with the standard pre-delay path
  - If not live: run `teardown()` if we had previously injected

**Cleanup on SPA navigation (both platforms)**
- Full teardown before reinitializing: remove `#allchat-container`, remove injected `<style>` tags, call `showNativeChat()`
- `teardown()` is a shared method on `PlatformDetector` base class; platforms can override for extra cleanup
- Teardown fires **immediately on URL change** — before the new page loads, not after

### Claude's Discretion
- Exact `waitForElement()` implementation (Promise, callback, or generator)
- Whether to use a single shared `<style>` id or per-feature ids for Twitch hide styles
- Handling of edge cases where `.chat-shell` parent element is not accessible

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INJ-01 | Twitch chat iframe is mounted in the native `.chat-shell` DOM slot, not appended to `document.body` as a fixed overlay | `waitForElement('.chat-shell')` pattern replaces `createInjectionPoint()` body append; slot found via polling, not immediate query |
| INJ-02 | Fixed-position overlay code path (`createInjectionPoint()` body append) is fully removed — no silent fallback | Current `createInjectionPoint()` in `twitch.ts` lines 93–121 must be deleted; no alternative injection path survives |
| INJ-03 | MutationObserver is scoped to the native chat slot parent only (not `document.body subtree: true`) | Current `setupMutationObserver()` in `twitch.ts` line 296 observes `document.body` with `subtree: true`; must be replaced with parent-scoped observer |
| INJ-04 | YouTube chat iframe is mounted by hiding `ytd-live-chat-frame` and inserting our container in the same flex slot | Current `createInjectionPoint()` in `youtube.ts` uses `parent.appendChild` (appends after); new code inserts before `ytd-live-chat-frame` using `insertBefore` |
| INJ-05 | YouTube SPA navigation uses `yt-navigate-finish` event instead of URL-polling MutationObserver | Current `setupUrlWatcher()` in `youtube.ts` lines 271–285 uses `MutationObserver` on `document`; replace with `window.addEventListener('yt-navigate-finish', ...)` + `popstate` fallback |
| INJ-06 | YouTube native chat is hidden via injected `<style>` tag (not inline style) so Polymer recreation on navigation doesn't restore it | Current `hideNativeChat()` in `youtube.ts` uses `style.display = 'none'` directly on element; Polymer re-renders the element, restoring inline styles; `<style>` tag survives re-render |
| INJ-07 | `waitForElement()` utility extracted to `PlatformDetector` base class, shared by all content scripts | `PlatformDetector.ts` has `findChatContainer()` (one-shot query); `waitForElement()` is the polling variant; both Twitch and YouTube call it from base class |
| INJ-08 | Fixed `TWITCH_INIT_DELAY` and `YOUTUBE_INIT_DELAY` constants removed; injection waits for DOM readiness instead | `TWITCH_INIT_DELAY = 1000` at `twitch.ts:12`; `YOUTUBE_INIT_DELAY = 2000` at `youtube.ts:12`; both must be deleted with all `setTimeout(..., DELAY)` call sites |
</phase_requirements>

---

## Summary

This phase replaces the current "inject a fixed-position overlay onto `document.body`" strategy with a "find the platform's own chat slot and mount inside it" strategy for both Twitch and YouTube. The core technical work is: (1) extracting a `waitForElement()` polling utility to the `PlatformDetector` base class, (2) replacing Twitch's `createInjectionPoint()` with a slot-aware approach that waits for `.chat-shell`, (3) replacing YouTube's inline-style hide with a `<style>` tag that survives Polymer re-renders, and (4) replacing YouTube's URL-polling MutationObserver with `yt-navigate-finish`/`popstate` event listeners.

All the locked decisions are well-reasoned and align with how the platforms actually work. The Twitch `.chat-shell` selector is the right target — it is the container Twitch renders into, not an internal scrollable. The YouTube `yt-navigate-finish` event is the canonical SPA navigation signal YouTube exposes to the page; it fires after the new page's DOM is settled, which is exactly when we need to re-check.

The biggest practical concern is that `yt-navigate-finish` behavior under A/B experiments is noted as a known risk in STATE.md. The research below documents what is known about it and how to handle the fallback reliably.

**Primary recommendation:** Implement `waitForElement()` as a Promise-based utility (cleanest async integration with the existing `async init()` chain). Keep it in `PlatformDetector` as a `protected` method so subclasses call it without exposure to the outside.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.3.3 (project) | All content script code | Already in use; `strict: true` enforced |
| Chrome Extensions API (`@types/chrome`) | ^0.0.254 | `chrome.runtime`, `chrome.storage` | Required for MV3 extension |
| MutationObserver (native DOM) | N/A | Detecting DOM changes | Standard browser API; no dependency needed |
| CustomEvent / `yt-navigate-finish` | N/A (YouTube internal) | YouTube SPA navigation signal | Exposed on `window` by YouTube's own code |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `getSyncStorage` (internal) | src/lib/storage | Extension enabled check | Already used in both content scripts |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Promise-based `waitForElement()` | Callback-based | Callbacks work but break the existing `async/await` chain; Promise integrates cleanly with `await this.waitForElement(...)` |
| Promise-based `waitForElement()` | Generator-based | Generator is more complex for no gain at this scale |
| `yt-navigate-finish` + `popstate` fallback | History API intercept (`pushState` monkey-patch) | History intercept is fragile and breaks other extensions; event-based approach is stable |
| Scoped MutationObserver on slot parent | `ResizeObserver` | ResizeObserver doesn't detect child removal; MutationObserver with `childList: true` is correct |

**Installation:** No new packages required. All APIs are either native browser APIs or already in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes needed. All edits are within:

```
src/
├── content-scripts/
│   ├── base/
│   │   └── PlatformDetector.ts   # Add waitForElement(), teardown()
│   ├── twitch.ts                 # Replace createInjectionPoint(), setupMutationObserver()
│   └── youtube.ts                # Replace hideNativeChat(), createInjectionPoint(), setupUrlWatcher()
```

### Pattern 1: waitForElement() — Promise-based polling

**What:** Returns a Promise that resolves with the element when it appears in the DOM, or rejects after a timeout.

**When to use:** Any time injection depends on a DOM element that may not exist yet (SPA deferred rendering). Replaces all `setTimeout(init, DELAY)` call sites.

**Implementation (Claude's discretion — Promise variant recommended):**

```typescript
// In PlatformDetector base class
protected waitForElement(
  selector: string,
  timeoutMs = 10_000,
  preDelayMs = 200,
  pollIntervalMs = 100
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const immediate = document.querySelector(selector) as HTMLElement | null;
      if (immediate) {
        resolve(immediate);
        return;
      }

      const deadline = Date.now() + timeoutMs;
      const interval = setInterval(() => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) {
          clearInterval(interval);
          resolve(el);
        } else if (Date.now() >= deadline) {
          clearInterval(interval);
          reject(new Error(`[AllChat] waitForElement: "${selector}" not found after ${timeoutMs}ms`));
        }
      }, pollIntervalMs);
    }, preDelayMs);
  });
}
```

The caller catches rejection and emits `console.warn`, leaving native chat visible (locked decision).

### Pattern 2: Twitch slot injection

**What:** Wait for `.chat-shell`, then append `#allchat-container` inside it.

**When to use:** Twitch stream page, after `initialize()` confirms extension is enabled.

```typescript
// In TwitchDetector.createInjectionPoint() — REPLACES current body-append code
async createInjectionPoint(): Promise<HTMLElement | null> {
  try {
    const slot = await this.waitForElement('.chat-shell');
    const container = document.createElement('div');
    container.id = 'allchat-container';
    container.style.cssText = 'width: 100%; height: 100%;';
    slot.appendChild(container);
    return container;
  } catch {
    console.warn('[AllChat Twitch] .chat-shell not found after timeout — native chat remains visible');
    return null;
  }
}
```

Note: `createInjectionPoint()` signature in the abstract base must become `async`. Both platforms implement it as async. The base class `init()` already uses `async/await`.

### Pattern 3: Twitch scoped MutationObserver

**What:** Observe `.chat-shell`'s parent for `childList` changes. If `.chat-shell` disappears, re-run `waitForElement()`.

**When to use:** After successful Twitch injection, while on the Twitch page.

```typescript
// Replaces current setupMutationObserver() which observes document.body subtree: true
function setupMutationObserver(slotParent: Element): MutationObserver {
  const observer = new MutationObserver(() => {
    const slotExists = slotParent.querySelector('.chat-shell');
    const containerExists = document.getElementById('allchat-container');

    if (!slotExists && !containerExists && globalDetector) {
      console.log('[AllChat Twitch] .chat-shell removed, re-running waitForElement...');
      globalDetector.init();
    }
  });

  observer.observe(slotParent, { childList: true, subtree: false });
  return observer;
}
```

The observer reference is stored so it can be disconnected on navigation / teardown.

### Pattern 4: YouTube `<style>` tag hide (INJ-06)

**What:** Inject `<style>` to hide `ytd-live-chat-frame` rather than setting `element.style.display = 'none'`.

**Why:** YouTube uses Polymer (lit-element). When Polymer re-renders a component, it replaces the DOM node. Inline styles on the old node are gone. A `<style>` tag in `<head>` persists across Polymer re-renders.

```typescript
// In YouTubeDetector.hideNativeChat() — REPLACES current inline style approach
hideNativeChat(): void {
  if (document.getElementById('allchat-hide-native-style')) return;

  const style = document.createElement('style');
  style.id = 'allchat-hide-native-style';
  style.textContent = `
    ytd-live-chat-frame {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
  console.log('[AllChat YouTube] Injected CSS to hide native chat');
}
```

### Pattern 5: YouTube DOM insertion position (INJ-04)

**What:** Insert `#allchat-container` before `ytd-live-chat-frame` in the flex parent, not after via `appendChild`.

**Why:** The parent (`#secondary` or equivalent) is a flex container. Inserting before `ytd-live-chat-frame` gives `#allchat-container` the same flex slot position the native chat occupies.

```typescript
// In YouTubeDetector.createInjectionPoint()
async createInjectionPoint(): Promise<HTMLElement | null> {
  try {
    const nativeChat = await this.waitForElement('ytd-live-chat-frame');
    const parent = nativeChat.parentElement;
    if (!parent) {
      console.warn('[AllChat YouTube] ytd-live-chat-frame has no parent');
      return null;
    }

    const container = document.createElement('div');
    container.id = 'allchat-container';
    container.style.cssText = 'width: 100%; height: 100%;';
    parent.insertBefore(container, nativeChat);
    return container;
  } catch {
    console.warn('[AllChat YouTube] ytd-live-chat-frame not found after timeout — native chat remains visible');
    return null;
  }
}
```

### Pattern 6: YouTube SPA navigation (INJ-05)

**What:** Listen for `yt-navigate-finish` on `window`. Fallback to `popstate`.

**When to use:** Registered once in `initialize()`, never re-registered.

```typescript
// In youtube.ts — REPLACES setupUrlWatcher() MutationObserver
function setupUrlWatcher(): void {
  let activeUrl = location.href;

  const handleNavigation = () => {
    const url = location.href;
    if (url === activeUrl) return; // Same page, ignore
    activeUrl = url;

    console.log('[AllChat YouTube] Navigation detected, tearing down...');
    globalDetector?.teardown();

    if (globalDetector?.isLiveStream()) {
      globalDetector.init();
    }
  };

  window.addEventListener('yt-navigate-finish', handleNavigation);
  window.addEventListener('popstate', handleNavigation);
}
```

Deduplication: both events may fire on the same navigation. The `url === activeUrl` guard prevents double-init.

### Pattern 7: teardown() in base class

**What:** Shared cleanup method on `PlatformDetector`. Called before every re-initialization.

```typescript
// In PlatformDetector base class — new shared method
teardown(): void {
  const container = document.getElementById('allchat-container');
  if (container) container.remove();

  const hideStyle = document.getElementById('allchat-hide-native-style');
  if (hideStyle) hideStyle.remove();

  this.showNativeChat();
  console.log(`[AllChat ${this.platform}] Teardown complete`);
}
```

Subclasses override `teardown()` only if they have extra state to clean (e.g., disconnecting the Twitch scoped observer).

### Anti-Patterns to Avoid

- **`document.body.appendChild(container)` with `position: fixed`:** This is what INJ-02 removes. Never re-introduce. Fixed overlays cause z-index fights and break platform layouts.
- **`subtree: true` on `document.body` MutationObserver:** Fires on every DOM change across the whole page. At CPU cost and creates re-init storm on Twitch. Replace with scoped parent observer.
- **`setTimeout(init, LARGE_CONSTANT)` as "wait for DOM":** Races with slow connections (timeout too short) and wastes time on fast ones (timeout too long). `waitForElement()` is always correct.
- **`element.style.display = 'none'` on Polymer components:** Polymer recreates the element on navigation, discarding inline styles. Use `<style>` tag in `<head>` instead.
- **Re-registering navigation listeners after each SPA navigation:** Leads to multiple handler stacks firing on each subsequent navigation. Register once.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling for element existence | Custom setTimeout loop per platform | `waitForElement()` in base class | Platforms had duplicate implementations; shared base class avoids drift |
| YouTube navigation detection | Custom history API monkey-patch | `yt-navigate-finish` + `popstate` | YouTube fires `yt-navigate-finish` natively; monkey-patching `pushState` conflicts with YouTube's own code and other extensions |
| CSS specificity for hiding Polymer elements | Inline style + attribute tracking | `<style id="...">` tag with `!important` | Polymer recreates elements; only CSS rules in `<head>` survive |

**Key insight:** Platform-specific DOM manipulation is inherently fragile. The only defenses are: (1) minimal surface area (target the fewest, most stable selectors), (2) self-healing via scoped observers, and (3) graceful degradation (timeout → show native chat, never crash).

---

## Common Pitfalls

### Pitfall 1: `yt-navigate-finish` may not fire under A/B experiments

**What goes wrong:** YouTube runs A/B experiments that sometimes change their client-side routing implementation. In some experiment arms, `yt-navigate-finish` fires with a delay or not at all for certain navigation types (e.g., navigating from one live stream to another without a full page load).

**Why it happens:** `yt-navigate-finish` is a YouTube-internal event, not a web standard. Its firing semantics are not guaranteed.

**How to avoid:** Always register `popstate` as a fallback alongside `yt-navigate-finish`. The deduplication guard (`url === activeUrl`) ensures the handler only runs once even if both fire.

**Warning signs:** During manual testing, navigating between YouTube videos fails to trigger teardown + re-injection. Check the console for missing navigation log lines.

### Pitfall 2: `.chat-shell` parent not accessible at observer setup time

**What goes wrong:** After `waitForElement('.chat-shell')` resolves, `.chat-shell` exists. But if `chatShell.parentElement` is null (extremely rare race), the observer cannot be scoped.

**Why it happens:** Theoretical — would require `.chat-shell` to be attached without a parent, which shouldn't happen in practice. But the codebase must handle it defensively.

**How to avoid:** Check `slotParent !== null` before calling `observer.observe(slotParent, ...)`. If null, fall back to no observer (the slot was found, so re-injection is not needed unless Twitch re-renders, which is unusual if the slot is stable).

**Warning signs:** TypeScript will enforce the null check if `strictNullChecks` is on (which it is — `strict: true` in `tsconfig.json`).

### Pitfall 3: `createInjectionPoint()` signature change breaks base class `init()`

**What goes wrong:** `createInjectionPoint()` is currently declared as `abstract createInjectionPoint(): HTMLElement | null` (synchronous). Changing it to async requires updating the abstract signature and the `init()` call site in the base class.

**Why it happens:** The base class calls `const container = this.createInjectionPoint()` without `await`. If only the implementations become async but the base class call site is not updated, the container will be a `Promise<HTMLElement | null>`, not an `HTMLElement | null`.

**How to avoid:** Update the abstract method signature to `abstract createInjectionPoint(): Promise<HTMLElement | null>` and add `await` at the call site in `PlatformDetector.init()`. TypeScript will enforce this — the type error will be obvious.

**Warning signs:** TypeScript error `Type 'Promise<HTMLElement | null>' is not assignable to type 'HTMLElement | null'` at the `init()` call site if `await` is missing.

### Pitfall 4: Duplicate event listeners on Twitch URL change + observer re-trigger

**What goes wrong:** Twitch's existing `setupUrlWatcher()` (MutationObserver on `document`) triggers on URL change. After URL change, `init()` runs again, which calls `waitForElement()`, which sets up a new scoped observer. If the old observer wasn't disconnected, both fire simultaneously and can trigger a double re-init.

**Why it happens:** The current Twitch MutationObserver URL watcher is still needed (Twitch has no `yt-navigate-finish` equivalent). But it must disconnect the old slot observer and only restart it after the new slot is found.

**How to avoid:** Store the slot observer reference. On URL change: (1) disconnect old observer, (2) call `teardown()`, (3) call `init()`, which will find the new slot and create a new observer.

**Warning signs:** Console logs showing double "re-running waitForElement" or double "UI injected" on Twitch navigation.

### Pitfall 5: YouTube `insertBefore` timing — `#allchat-container` appears after `ytd-live-chat-frame`

**What goes wrong:** Using `parent.appendChild(container)` (current code) places `#allchat-container` after `ytd-live-chat-frame` in the DOM. Even with `ytd-live-chat-frame { display: none }`, the flex layout may behave differently if container order matters.

**Why it happens:** Current `YouTubeDetector.createInjectionPoint()` uses `parent.appendChild(container)` which appends at end.

**How to avoid:** Use `parent.insertBefore(container, nativeChat)` to place `#allchat-container` in the same position `ytd-live-chat-frame` occupies in the flex flow.

---

## Code Examples

### Current code to DELETE

```typescript
// twitch.ts:12 — DELETE
const TWITCH_INIT_DELAY = 1000;

// youtube.ts:12 — DELETE
const YOUTUBE_INIT_DELAY = 2000;

// twitch.ts:93–121 — DELETE entire createInjectionPoint()
createInjectionPoint(): HTMLElement | null {
  // ... document.body.appendChild with position: fixed ...
}

// twitch.ts:296 — DELETE this observer.observe call
observer.observe(document.body, { childList: true, subtree: true });

// youtube.ts:120–135 — DELETE inline style approach
hideNativeChat(): void {
  const chatFrame = this.findChatContainer();
  if (chatFrame) {
    (chatFrame as HTMLElement).style.display = 'none';
    // ...
  }
}

// youtube.ts:271–285 — DELETE MutationObserver URL watcher
function setupUrlWatcher() {
  new MutationObserver(() => { ... }).observe(document, { subtree: true, childList: true });
}
```

### Correct `<style>` tag pattern for hiding native chat

```typescript
// Pattern already established in TwitchDetector.hideNativeChat() (twitch.ts:46–73)
// id="allchat-hide-native-style" — KEEP this id pattern
// Extend same pattern to YouTubeDetector.hideNativeChat()
const style = document.createElement('style');
style.id = 'allchat-hide-native-style';
style.textContent = `ytd-live-chat-frame { display: none !important; }`;
document.head.appendChild(style);
```

### `teardown()` call sequence

```typescript
// Called immediately on URL change (before new page loads)
// Order matters:
// 1. Remove #allchat-container  (stops iframe, frees memory)
// 2. Remove #allchat-hide-native-style  (native chat becomes visible again)
// 3. Call showNativeChat()  (handles any platform-specific residue)
// 4. Disconnect slot observer  (Twitch only — override in TwitchDetector)
```

### Abstract method signature changes in PlatformDetector

```typescript
// BEFORE (current)
abstract createInjectionPoint(): HTMLElement | null;

// AFTER (this phase)
abstract createInjectionPoint(): Promise<HTMLElement | null>;
```

The base `init()` method must `await this.createInjectionPoint()`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `setTimeout(init, 1000)` | `waitForElement()` polling | This phase | Eliminates race conditions; works on fast and slow connections |
| `document.body` overlay | Mount in platform DOM slot | This phase | No z-index fights; platform controls layout |
| `subtree: true` body observer | Scoped parent observer | This phase | Reduces observer noise by ~99% on Twitch |
| MutationObserver URL polling (YouTube) | `yt-navigate-finish` + `popstate` | This phase | DOM-polling URL watcher fires thousands of times per navigation; event-based fires once |
| Inline `style.display = 'none'` (YouTube) | `<style>` tag with `!important` | This phase | Survives Polymer re-renders |

**Deprecated/outdated patterns (being removed):**
- `TWITCH_INIT_DELAY` / `YOUTUBE_INIT_DELAY`: timing-based init is wrong; replaced by `waitForElement()`
- `createInjectionPoint()` body append with `position: fixed`: entire code path deleted, not hidden behind a flag

---

## Open Questions

1. **`yt-navigate-finish` fires but `ytd-live-chat-frame` not yet in DOM on the new page**
   - What we know: `yt-navigate-finish` fires when YouTube considers navigation "finished" but DOM settlement is not guaranteed to include `ytd-live-chat-frame`
   - What's unclear: Does the 200ms pre-delay in `waitForElement()` cover this, or is `ytd-live-chat-frame` sometimes injected >200ms after `yt-navigate-finish`?
   - Recommendation: The 10-second timeout + 100ms poll in `waitForElement()` means this is handled even if it takes a few seconds. The 200ms pre-delay is just for efficiency. No special handling needed — `waitForElement()` will poll until it appears or timeout.

2. **Twitch A/B testing of `.chat-shell` selector stability**
   - What we know: The locked decision pins to `.chat-shell` as the single selector (no fallback chain)
   - What's unclear: Twitch occasionally renames CSS classes. If `.chat-shell` disappears, `waitForElement()` will timeout after 10s and show native chat — which is the correct graceful fallback per locked decisions
   - Recommendation: Document the selector with a date comment in code for future maintenance awareness

---

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright 1.57.0 |
| Config file | `playwright.config.ts` (root) |
| Quick run command | `npx playwright test tests/test-container-cleanup.spec.ts` |
| Full suite command | `npx playwright test` |

**Note:** The existing test suite uses live Twitch/YouTube URLs (`page.goto('https://www.twitch.tv/...')`). Phase 1 injection changes should be validated against both the existing fixture HTML files and the live URLs. The fixture HTML files (`tests/fixtures/twitch-mock.html`, `tests/fixtures/youtube-mock.html`) do not have `.chat-shell` or `ytd-live-chat-frame` — they will need updating to match the new slot-based injection targets.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INJ-01 | Twitch iframe mounts in `.chat-shell`, not body | integration (Playwright) | `npx playwright test tests/` | Partial — existing tests check container count, not slot location |
| INJ-02 | No `position: fixed` container exists on Twitch page | integration (Playwright) | `npx playwright test tests/` | ❌ Wave 0 |
| INJ-03 | MutationObserver scoped to slot parent (not body subtree) | unit / code inspection | manual-only — no test runner for content script unit tests | ❌ Wave 0 |
| INJ-04 | YouTube container inserted before `ytd-live-chat-frame` in DOM | integration (Playwright) | `npx playwright test tests/` | ❌ Wave 0 |
| INJ-05 | `yt-navigate-finish` triggers teardown + re-init | integration (Playwright) | `npx playwright test tests/` | ❌ Wave 0 |
| INJ-06 | `ytd-live-chat-frame` hidden via `<style>` tag (not inline) | integration (Playwright) | `npx playwright test tests/` | ❌ Wave 0 |
| INJ-07 | `waitForElement()` exists on `PlatformDetector` base class | unit / code inspection | `npx tsc --noEmit` (type check) | ❌ Wave 0 |
| INJ-08 | `TWITCH_INIT_DELAY` and `YOUTUBE_INIT_DELAY` absent from codebase | static analysis | `grep -r "INIT_DELAY" src/` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` (type-check; fast, catches signature errors)
- **Per wave merge:** `npx playwright test` (full Playwright suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test-slot-injection.spec.ts` — covers INJ-01, INJ-02, INJ-04, INJ-06: verifies `.chat-shell` contains `#allchat-container`, no `position:fixed` element, `ytd-live-chat-frame` hidden via `<style>` tag
- [ ] `tests/test-spa-navigation.spec.ts` — covers INJ-05: verifies teardown + re-init on YouTube navigation
- [ ] `tests/fixtures/twitch-mock.html` — needs `.chat-shell` element added (currently has `.right-column` only) for offline injection tests
- [ ] `tests/fixtures/youtube-mock.html` — already has `ytd-live-chat-frame`; update parent to match real YouTube flex layout

*(Existing `test-container-cleanup.spec.ts` and `test-streamer-switch.spec.ts` test live URLs; they remain valuable for INJ-01 regression but do not cover all new requirements)*

---

## Sources

### Primary (HIGH confidence)

- Direct code reading — `src/content-scripts/twitch.ts`, `src/content-scripts/youtube.ts`, `src/content-scripts/base/PlatformDetector.ts`: all current behavior, selectors, and patterns documented from source
- Direct code reading — `tests/fixtures/twitch-mock.html`, `tests/fixtures/youtube-mock.html`: current test fixture HTML structure
- `tsconfig.json`: `strict: true` confirmed — TypeScript will enforce null checks and async signatures

### Secondary (MEDIUM confidence)

- `yt-navigate-finish` event: documented in multiple community sources as YouTube's canonical SPA navigation event; listed as known risk in `STATE.md` — treat as MEDIUM until verified in live browser
- Polymer re-render behavior (inline style loss): well-known Polymer/LitElement behavior; `<style>` tag pattern is the established workaround

### Tertiary (LOW confidence)

- `.chat-shell` as Twitch's canonical slot selector: confirmed from existing `getChatContainerSelector()` in `twitch.ts` which lists it as a fallback; accepted as correct per locked decisions but not verified against current live Twitch DOM

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all technology is already in use in the project; no new dependencies
- Architecture: HIGH — all patterns derived from reading existing code + locked decisions
- Pitfalls: HIGH for TypeScript-enforceable issues (signature changes), MEDIUM for runtime behavior (Polymer re-renders, `yt-navigate-finish` timing)

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (Twitch/YouTube DOM selectors can change; re-verify `.chat-shell` and `ytd-live-chat-frame` against live pages before implementation)
