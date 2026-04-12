# Phase 7: Twitch Native Widget Extraction - Research

**Researched:** 2026-04-12
**Domain:** Chrome Extension / DOM cloning / Twitch widget extraction / Tab bar injection
**Confidence:** MEDIUM (selector verification against live Twitch required before implementation)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Widget Placement**
- D-01: Widgets positioned to match native Twitch locations — predictions/polls/hype trains at top of chat, channel points at bottom.
- D-02: Two widget zones created by content script: top zone (above iframe, for predictions/polls/hype trains) and bottom zone (below iframe, for channel points). Iframe flexes between them.
- D-03: Widget zones only visible when AllChat tab is active. When Twitch Chat tab is active, native chat fully restored (full swap).

**Tab Bar Design**
- D-04: Tab bar replaces the AllChat iframe header entirely. InfinityLogo moves into the AllChat tab label (`[∞ AllChat] | [Twitch Chat]`).
- D-05: Tab bar styled with AllChat design system (OkLCh tokens, Inter font) — not Twitch native styling.
- D-06: Tab bar injected by content script, outside iframe. Controls visibility of both views.
- D-07: Full swap on tab switch: Twitch Chat tab hides AllChat iframe + widget zones and fully restores native Twitch chat. AllChat tab reverses. Tab bar persists at top regardless of active view.
- D-08: Replaces existing "Switch to native" button in content script overlay and ChatContainer header. Phase 6 `handleSwitchToNative()` / `handleSwitchToAllChat()` infrastructure refactored into tab bar.

**Extraction Method**
- D-09: Clone + event forwarding approach. Widgets are deep-cloned (`cloneNode(true)`) from hidden native chat DOM into AllChat widget zones.
- D-10: MutationObserver on original widget nodes keeps clones visually in sync (attribute changes, child mutations).
- D-11: Click events on cloned widgets intercepted and programmatically dispatched (`dispatchEvent()`) on corresponding original hidden element, preserving full interactivity.
- D-12: Native chat remains hidden via existing CSS `<style>` tag approach (`visibility: hidden + height: 0`). Original widgets stay in React's tree — undisturbed by cloning.

**Widget Scope**
- D-13: All major Twitch interactive widgets in scope: channel points (balance, claim bonus, redemptions), predictions, polls, hype trains, raid banners.
- D-14: Dynamic widget detection via MutationObserver on native chat container. When a prediction/poll/hype train appears in native DOM, automatically cloned into appropriate widget zone. When original disappears, clone removed.
- D-15: Channel points widget is persistent (always visible for logged-in viewers) — cloned once on initialization and kept in sync.
- D-16: Predictions, polls, hype trains, and raids are transient — cloned on appearance, removed on disappearance.

### Claude's Discretion

None specified — all implementation decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

- YouTube widget extraction (Super Chat highlights, membership badges, polls)
- Kick widget extraction (sub gifting, polls, slow mode indicators)
- Tab bar on YouTube/Kick
</user_constraints>

---

## Summary

Phase 7 extracts Twitch-native interactive widgets (channel points, predictions, polls, hype trains, raids) from the hidden native chat DOM and surfaces them alongside the AllChat iframe. The approach uses deep DOM cloning (`cloneNode(true)`) with event forwarding — intercepting clicks on clones and re-dispatching them on the originals. A MutationObserver on the native chat container drives dynamic clone management (creation/removal when transient widgets appear/disappear). A tab bar (`[∞ AllChat] | [Twitch Chat]`) injected by the content script replaces the existing small "Switch to native" button and the ChatContainer header.

The core technical challenge is the event forwarding system: `cloneNode(true)` does NOT copy `addEventListener()` listeners, so clones are visually accurate but interactively inert. The solution (D-11) intercepts clicks at the clone level and re-dispatches them on the corresponding original element, which has all React event handlers intact. This requires maintaining a stable 1:1 element mapping between the clone tree and the original tree.

Twitch widget selectors for channel points, predictions, polls, and hype trains are not verifiable without live browser inspection — they must be verified against the live Twitch DOM before the implementation task touches them. This is the single highest-risk item in the phase.

**Primary recommendation:** Build the tab bar and widget zone layout (structurally safe) before tackling widget extraction. Verify all Twitch selectors against live Twitch before writing any selector-dependent code.

---

## Standard Stack

### Core (no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.3.3 | Content script implementation | Already in project [VERIFIED: package.json] |
| MutationObserver | Browser native | Widget appearance/disappearance detection | W3C standard, already used in project [VERIFIED: twitch.ts] |
| `cloneNode(true)` | Browser native | Deep DOM clone of widget subtrees | W3C standard [CITED: developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode] |
| `dispatchEvent()` | Browser native | Event forwarding from clone to original | W3C standard [ASSUMED: sufficient for React synthetic events] |
| Playwright | ^1.59.1 | E2E test framework | Already in project [VERIFIED: package.json] |

### No new npm packages required

All implementation is in vanilla TypeScript + browser DOM APIs. The tab bar uses inline styles with OkLCh tokens already defined in `styles.css` — no new CSS framework or component library needed.

---

## Architecture Patterns

### Recommended Project Structure (new files)

```
src/
├── content-scripts/
│   ├── twitch.ts                      # MODIFIED: add tab bar init, refactor switch handlers
│   └── base/
│       └── PlatformDetector.ts        # MODIFIED: remove injectSwitchToAllChatButton / removeSwitchToAllChatButton
src/
├── ui/
│   └── components/
│       └── ChatContainer.tsx          # MODIFIED: remove header (tab bar replaces it)
tests/
├── test-tab-bar.spec.ts               # NEW: tab bar toggle E2E tests
├── test-widget-zones.spec.ts          # NEW: widget zone injection tests
└── fixtures/
    └── twitch-mock.html               # MODIFIED: add mock widget elements
```

### Pattern 1: .chat-shell Flex Layout with Widget Zones

**What:** `.chat-shell` becomes a flex column with three slots: top-zone, AllChat iframe, bottom-zone. The AllChat iframe is the middle child, sized to fill remaining space. Widget zones are `div` elements with `overflow: hidden` by default, expanding to `auto` when widgets are present.

**When to use:** When AllChat tab is active. When Twitch Chat tab is active, the whole AllChat layer (tab bar aside) is hidden and native Twitch layout takes over.

**Current state:** `#allchat-container` uses `position: absolute; inset: 0; z-index: 1` inside `.chat-shell`. This must change to a flex column layout. The `.chat-shell` currently has `position: relative` applied inline by the content script.

**Proposed layout:**

```typescript
// Source: twitch.ts createInjectionPoint() — modified for Phase 7
// Replace the absolute-positioned container with a flex column
container.style.cssText = `
  position: absolute; inset: 0; z-index: 1;
  display: flex; flex-direction: column;
`;

// Tab bar — fixed height, outside scroll
const tabBar = document.createElement('div');
tabBar.id = 'allchat-tab-bar';
tabBar.style.cssText = `flex: 0 0 auto; ...`;

// Top zone — predictions/polls/hype trains
const topZone = document.createElement('div');
topZone.id = 'allchat-widget-zone-top';
topZone.style.cssText = `flex: 0 0 auto; overflow: hidden;`;

// Iframe wrapper — fills remaining space
const iframeWrapper = document.createElement('div');
iframeWrapper.id = 'allchat-iframe-wrapper';
iframeWrapper.style.cssText = `flex: 1 1 0; min-height: 0;`;

// Bottom zone — channel points
const bottomZone = document.createElement('div');
bottomZone.id = 'allchat-widget-zone-bottom';
bottomZone.style.cssText = `flex: 0 0 auto; overflow: hidden;`;

container.append(tabBar, topZone, iframeWrapper, bottomZone);
```

### Pattern 2: Tab Bar with Full Swap

**What:** Two tab buttons. Clicking "AllChat" tab: hides native chat (re-injects CSS hide style), shows `#allchat-container`, shows widget zones. Clicking "Twitch Chat" tab: shows native chat, hides `#allchat-container` (or just the iframe + zones). Tab bar itself always persists.

**Key insight:** D-07 specifies that the tab bar persists regardless of active view. This means the tab bar cannot live inside `#allchat-container` (which gets hidden). It must be a sibling injected directly into `.chat-shell`, not a child of the container that holds the iframe.

**Revised structure:**

```
.chat-shell (position: relative)
├── #allchat-tab-bar           (position: absolute; top: 0; left: 0; right: 0; z-index: 2)
├── #allchat-container         (position: absolute; inset: 0; padding-top: [tab-bar height]; z-index: 1)
│   ├── #allchat-widget-zone-top
│   ├── #allchat-iframe-wrapper
│   └── #allchat-widget-zone-bottom
└── [native Twitch chat subtree] (hidden via CSS when AllChat tab is active)
```

When "Twitch Chat" is active: `#allchat-container` is `display: none`, native CSS hide style is removed. Tab bar remains via `z-index: 2`.

### Pattern 3: Clone + Event Forwarding

**What:** `cloneNode(true)` produces a visual replica. Since React event handlers are NOT copied by `cloneNode`, clicks on the clone must be captured and forwarded to the original.

**Critical constraint:** `cloneNode(true)` does NOT copy `addEventListener()` event listeners. [CITED: developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode]. React uses synthetic event delegation (a single listener on the root), so clones will appear interactive in HTML but React will not respond to events on them. The forwarding pattern is therefore mandatory.

**Implementation:**

```typescript
// [ASSUMED: React synthetic events on originals respond to programmatic dispatchEvent]
function forwardCloneEvents(clone: HTMLElement, original: HTMLElement): void {
  // Capture all clicks on the clone subtree
  clone.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Find corresponding element in original tree by position/index
    const path = getElementPath(e.target as HTMLElement, clone);
    const originalTarget = resolveElementByPath(original, path) ?? original;
    
    // Dispatch a trusted-equivalent click on the original
    originalTarget.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,  // crosses shadow DOM boundaries if any
      clientX: e.clientX,
      clientY: e.clientY,
    }));
  }, true); // useCapture: true to intercept before clone's inline handlers
}

// Element path: array of child indices from root to target
function getElementPath(target: HTMLElement, root: HTMLElement): number[] {
  const path: number[] = [];
  let el: HTMLElement | null = target;
  while (el && el !== root) {
    const parent = el.parentElement;
    if (!parent) break;
    path.unshift(Array.from(parent.children).indexOf(el));
    el = parent;
  }
  return path;
}

function resolveElementByPath(root: HTMLElement, path: number[]): HTMLElement | null {
  let el: Element = root;
  for (const idx of path) {
    el = el.children[idx];
    if (!el) return null;
  }
  return el as HTMLElement;
}
```

**Risk:** If the original widget subtree structure diverges from the clone's structure (e.g., React re-renders change child ordering), path-based resolution fails silently. Mitigation: keep original and clone in sync via MutationObserver (D-10), so structural changes propagate to clone before the user can click.

**[ASSUMED]:** `dispatchEvent()` on a React element triggers React's synthetic event system. React 18 attaches event delegation to the root container, not individual nodes, so a bubbling click event on any React-managed node should reach the React handler. This is a training-data assumption — verify during implementation.

### Pattern 4: MutationObserver for Clone Sync (D-10) and Widget Detection (D-14)

**Observer 1 — Clone sync:** Watches the original widget for attribute and child mutations. On mutation: re-clone (or patch) the clone to match. Simplest safe strategy: remove old clone and insert fresh `cloneNode(true)` — avoids incremental diffing complexity. Acceptable for widgets (low-frequency changes: e.g., points balance ticking up).

**Observer 2 — Widget zone detection:** Watches the native chat's parent container (`.chat-shell`) for new transient widgets appearing (prediction card, poll card, hype train bar, raid banner). When detected: clone into the appropriate zone. When original is removed from DOM: remove the clone.

```typescript
// Widget detection observer on .chat-shell
const widgetObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const zone = classifyWidget(node);  // returns 'top' | 'bottom' | null
      if (zone) cloneWidgetIntoZone(node, zone);
    }
    for (const node of mutation.removedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      removeCloneForOriginal(node);
    }
  }
});
widgetObserver.observe(chatShell, { childList: true, subtree: true });
```

### Anti-Patterns to Avoid

- **Cloning the entire `.chat-shell` subtree:** Extremely expensive, breaks layout, unnecessary. Clone only the specific widget nodes.
- **Removing original widget from DOM:** Breaks React's tree. Always leave originals in place (D-12). Only the CSS hide prevents their visual rendering.
- **Relying solely on class selectors for Twitch widgets:** Twitch's generated class names (e.g., `.jAIlLI`) change on deploy. Use `data-test-selector` attributes where they exist; fall back to `data-a-target`; use class selectors only as last resort with date comments.
- **Tab bar inside `#allchat-container`:** Tab bar must be a sibling, not a child, of the container that gets hidden/shown. Otherwise switching to Twitch Chat also hides the tab bar itself.
- **Targeting `visibility: hidden` elements for clicks:** Although hidden via CSS, elements remain in the DOM and respond to programmatic events. Do not use `pointer-events: none` on original widgets — they must remain event-capable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Widget visual sync | Custom DOM diffing algorithm | Re-clone on MutationObserver callback | Diffing is complex and error-prone; re-cloning is O(widget size), not O(page size) |
| Element-path resolution across clone/original | Structural hashing | Simple child-index path array | Sufficient for flat widget DOM; over-engineering otherwise |
| CSS injection for tab bar | Separate stylesheet file | Inline styles with OkLCh tokens (same pattern as existing switch button) | Consistent with established pattern in `PlatformDetector.injectSwitchToAllChatButton()` |
| Twitch widget CSS in widget zones | Re-write Twitch styles | Let cloned nodes inherit their original Twitch stylesheet | Twitch page stylesheets apply to all elements including clones in the same document |

**Key insight:** Cloned nodes inherit their original stylesheets because they live in the same document as the originals. Twitch's own CSS will style them correctly without any intervention — unless Twitch uses shadow DOM for widgets (unlikely for these UI widgets, but worth checking during implementation).

---

## Common Pitfalls

### Pitfall 1: Twitch Selector Rot

**What goes wrong:** Hardcoded selectors for channel points (`[data-test-selector="community-points-summary"]`), predictions, or hype trains fail silently when Twitch deploys a frontend update.

**Why it happens:** Twitch uses React with obfuscated class names and periodically changes `data-test-selector` attributes. Community scripts targeting these break regularly (evidenced by auto-clicker extension update histories). [CITED: github.com/mikeyaworski/Auto-Claim-Twitch-Channel-Points]

**How to avoid:** 
- Multi-level selector fallback chains (same pattern as KICK-07)
- `data-test-selector` first (most stable), then `data-a-target`, then ARIA attributes, then class patterns
- Date-stamped comments on every selector
- MutationObserver on `.chat-shell` subtree observes widget appearance — if no selector matches, zone stays empty without breaking the extension

**Warning signs:** Widget zone remains empty while a prediction/poll is clearly running in native chat. Channel points balance zone stays empty for logged-in users.

### Pitfall 2: Event Forwarding Fails on React-Managed Elements

**What goes wrong:** Clicks on cloned widgets dispatch to the original, but React does not respond because the event does not pass React's internal trust/target checks.

**Why it happens:** React 18 attaches a single delegated listener on the root container. For synthetic events to fire, the dispatched event must bubble from the actual target element up through the React root. If `cloneNode` copies inline `onclick` HTML attributes, those fire on the clone (not the original) — but React's `onClick` handlers on the original do not fire because the event originated on the clone, not an element in React's tree. [VERIFIED: MDN cloneNode docs — `addEventListener` listeners not copied, but HTML attribute handlers are]

**How to avoid:** Always dispatch the forwarded click on the **original** element (not the clone). The original is inside `.chat-shell` under the CSS-hidden native chat. Programmatic `dispatchEvent` on React-managed elements in the same document DOES trigger React event delegation.

**Warning signs:** Channel points claim button appears to click (visual feedback on clone) but points balance does not change. Prediction vote buttons show no confirmation.

**Fallback:** If dispatchEvent fails, try `.click()` (synchronous, higher browser trust), or `element.closest('[data-test-selector]').click()` on the original.

### Pitfall 3: Tab Bar Disappears When Native Chat Is Active

**What goes wrong:** After switching to "Twitch Chat" tab, the tab bar disappears.

**Why it happens:** Tab bar was placed inside `#allchat-container`, which gets `display: none` when Twitch Chat tab is active.

**How to avoid:** Inject `#allchat-tab-bar` as a direct child of `.chat-shell`, sibling to `#allchat-container`. Use `z-index: 2` to ensure it renders above both native chat and `#allchat-container`.

**Warning signs:** Can switch from AllChat to Twitch Chat but cannot switch back.

### Pitfall 4: Flex Layout Breaks `.chat-shell` Height

**What goes wrong:** Switching from `position: absolute; inset: 0` to `display: flex; flex-direction: column` causes the widget zones to affect `.chat-shell`'s intrinsic height, breaking Twitch's page layout.

**Why it happens:** `position: absolute` takes the container out of flow — flex does not. If `.chat-shell` has `height: auto` or depends on its children for sizing, adding flex children changes its height.

**How to avoid:** Keep `#allchat-container` as `position: absolute; inset: 0` (its current CSS). Inside the container, use flex layout for the three zones. The absolute positioning preserves Twitch's outer layout while allowing internal flex.

### Pitfall 5: MutationObserver on `.chat-shell subtree: true` Performance

**What goes wrong:** Observing the entire `.chat-shell` subtree with `{ subtree: true, childList: true, attributes: true }` fires thousands of callbacks for every chat message DOM update.

**Why it happens:** Chat messages are added to the DOM 10-100x per minute in active streams. Each message adds multiple DOM nodes.

**How to avoid:** 
- Widget detection observer: only `{ childList: true, subtree: false }` on `.chat-shell` direct children (widgets are top-level children of `.chat-shell`, not nested inside chat message list). 
- Clone sync observer: targeted on specific widget nodes only, not `.chat-shell`.

**Warning signs:** CPU usage spikes while watching busy streams; `console.log` shows observer firing hundreds of times per message.

### Pitfall 6: `ChatContainer.tsx` Header Removal and Message Protocol

**What goes wrong:** Removing the header from `ChatContainer.tsx` also removes the collapse button and connection dot, which are currently inside the iframe header.

**Why it happens:** The iframe header currently contains: collapse button, InfinityLogo, connection dot, platform badge, switch-to-native button, pop-out button. The tab bar (content script) replaces the switch-to-native button and InfinityLogo branding. The collapse button, connection dot, platform badge, and pop-out button must either move to the tab bar or be retained in a modified iframe header.

**How to avoid:** Plan explicitly whether the iframe header is fully removed (tab bar takes all controls) or slimmed down (tab bar takes logo + switch controls; iframe retains connection dot + pop-out).

**Decision required during planning:** D-04 says the tab bar "replaces the AllChat iframe header entirely" and that InfinityLogo moves into the tab label. This implies the iframe header is fully removed. The connection dot, platform badge, and pop-out button must then move to the tab bar. This is a content-script concern (the tab bar knows the platform), so the connection dot state would need to be communicated from the iframe to the content script via postMessage.

**Simpler alternative:** Slim the iframe header rather than removing it — keep connection dot and pop-out button in the iframe, only remove InfinityLogo and switch-to-native button (since tab bar handles them). D-04 says "replaces entirely" so this may contradict locked decisions. Planner should note this tension.

---

## Code Examples

Verified patterns from the existing codebase:

### Existing Switch Handler Pattern (to be refactored into tab bar)

```typescript
// Source: src/content-scripts/base/PlatformDetector.ts lines 270-293
// This is what D-08 says to refactor into the tab bar
handleSwitchToNative(): void {
  const container = document.getElementById('allchat-container');
  if (container) {
    container.style.display = 'none';
    this.allchatHidden = true;
  }
  this.showNativeChat();
  this.injectSwitchToAllChatButton();
}

handleSwitchToAllChat(): void {
  const container = document.getElementById('allchat-container');
  if (container) {
    container.style.display = '';
    this.allchatHidden = false;
  }
  this.hideNativeChat();
  this.removeSwitchToAllChatButton();
}
```

### Existing CSS Hide Pattern (compatible with widget extraction)

```typescript
// Source: src/content-scripts/twitch.ts lines 56-81
// This hide rule deliberately excludes interactive widget elements
// The current rule hides: chat-input, welcome-message, chat log, chat-wysiwyg-input
// Channel points container and prediction/poll overlay are NOT in this list
// — widgets are in a different part of .chat-shell's DOM
hideNativeChat(): void {
  const hideStyle = document.createElement('style');
  hideStyle.id = 'allchat-hide-native-style';
  hideStyle.textContent = `
    [data-a-target="chat-input"],
    [data-a-target="chat-welcome-message"],
    div[role="log"][class*="chat"],
    .chat-input,
    .chat-scrollable-area__message-container,
    .chat-wysiwyg-input {
      visibility: hidden !important;
      height: 0 !important; min-height: 0 !important; overflow: hidden !important;
    }
  `;
  document.head.appendChild(hideStyle);
}
```

### Existing Button Injection Pattern (tab bar follows the same approach)

```typescript
// Source: src/content-scripts/base/PlatformDetector.ts lines 299-326
// Tab bar uses same inline-style + document.createElement approach
// but injects into .chat-shell (not document.body)
protected injectSwitchToAllChatButton(): void {
  const btn = document.createElement('div');
  btn.id = 'allchat-switch-btn';
  btn.style.cssText = `position: fixed; bottom: 16px; right: 16px; z-index: 9999;
    background: oklch(0.11 0.009 270); border: 1px solid oklch(0.22 0.008 270);
    ...`;
  document.body.appendChild(btn); // Tab bar goes to .chat-shell instead
}
```

### Existing MutationObserver Pattern (scoped to slot parent)

```typescript
// Source: src/content-scripts/twitch.ts lines 117-131
// Widget detection follows the same scoped-observer pattern
slotObserver = new MutationObserver(() => {
  const slotExists = slot.parentElement?.querySelector('.chat-shell');
  if (!slotExists && !containerExists && globalDetector) {
    globalDetector.init();
  }
});
slotObserver.observe(slot.parentElement, { childList: true, subtree: false });
```

---

## Twitch Widget Selector Reference

**Status: ASSUMED — must be verified against live Twitch before implementation.**

The following selectors are drawn from community channel points automation scripts and training knowledge. They MUST be verified by opening DevTools on a live Twitch stream before being written into production code.

### Channel Points (persistent widget — always present for logged-in viewers)

| Element | Likely Selector | Confidence | Source |
|---------|-----------------|------------|--------|
| Widget root container | `[data-test-selector="community-points-summary"]` | LOW | [CITED: github.com/Ephellon gist] |
| Balance display | `[data-test-selector="copo-balance-string"]` | LOW | [CITED: github.com/sangshrestha/twitch-prediction] |
| Claim bonus button | `button[data-test-selector*="claim"]` | LOW | [CITED: github.com/DMIPYA/twitch-points-collector] |
| Widget container parent | `.community-points-summary` | LOW | [ASSUMED] |

### Predictions (transient — appears when broadcaster starts a prediction)

| Element | Likely Selector | Confidence |
|---------|-----------------|------------|
| Prediction card root | `[data-test-selector="community-prediction-highlight-header"]` | LOW |
| Prediction title | `[data-test-selector="community-prediction-highlight-header-title"]` | LOW |
| Vote buttons | `[data-test-selector="predictions-list-item__title"]` | LOW |

**[ASSUMED]:** These selectors are from 2023-era community scripts. Twitch may have changed them.

### Polls (transient — appears when broadcaster starts a poll)

No confirmed selectors available from public sources. [ASSUMED] Polls likely use a wrapper with `data-test-selector="poll-overlay"` or similar, but this is unverified.

### Hype Trains (transient — appears during hype train event)

No confirmed selectors from public sources. [ASSUMED] Hype train likely has a container near the top of `.chat-shell` (it appears above the chat message list in native Twitch UI).

### Raid Banners (transient — appears when stream is raided)

No confirmed selectors from public sources. [ASSUMED] Raid notification appears at the top of chat area.

**Critical pre-implementation task:** For all widget categories, the implementer MUST open DevTools on a live Twitch stream (ideally one with an active prediction or poll), inspect the DOM structure of each widget, and document the stable selectors before writing any extraction code. This mirrors how Phase 3 Kick selectors were verified against live kick.com before implementation.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed "Switch to native" button (document.body, fixed-position) | Tab bar (injected into .chat-shell, z-index sibling) | Phase 7 | Tab bar is always visible; no need to find it in the page corner |
| Small "Native" button in ChatContainer header | Tab bar replaces entire iframe header | Phase 7 | InfinityLogo + tab switching moves to content script |
| `handleSwitchToNative()` / `handleSwitchToAllChat()` in PlatformDetector | Tab bar toggle functions | Phase 7 | Old methods become internal implementations; tab bar is the public interface |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `dispatchEvent(new MouseEvent('click'))` on React-managed original elements triggers React's synthetic event system | Architecture Patterns — Pattern 3 | Event forwarding fails entirely; channel points / prediction votes don't work |
| A2 | Twitch widgets (channel points, predictions, polls, hype trains) are NOT in shadow DOM | Don't Hand-Roll | Cloned nodes would not inherit Twitch stylesheets; visual fidelity breaks |
| A3 | Widget containers are direct or near-direct children of `.chat-shell`, not deeply nested inside the chat message list | Architecture Patterns — Pattern 4 | Widget detection observer scope incorrect; observer must be adjusted |
| A4 | Selector `[data-test-selector="community-points-summary"]` still valid on live Twitch (2026) | Twitch Widget Selector Reference | Channel points zone stays empty |
| A5 | Prediction/poll/hype train selectors exist and are stable enough for a fallback chain | Twitch Widget Selector Reference | Transient widgets cannot be cloned |
| A6 | The iframe header can be fully removed without affecting pop-out mode (pop-out has its own independent header logic) | Common Pitfalls — Pitfall 6 | Pop-out loses connection dot and navigation controls |
| A7 | Inline `onclick` HTML attributes on Twitch widget elements (if any) ARE copied by `cloneNode(true)` and fire on the clone instead of the original | Architecture Patterns — Pattern 3 | Duplicate event handling: event fires twice (once on clone via attribute, once forwarded to original) |

---

## Open Questions

1. **Does the iframe header get fully removed or slimmed down?**
   - What we know: D-04 says tab bar replaces the header entirely. Connection dot, platform badge, and pop-out button live in the header. 
   - What's unclear: Where do those controls go if the header is removed? Into the tab bar? This adds complexity to the content script (it would need to relay connection state from iframe postMessages into the tab bar DOM).
   - Recommendation: Planner should decide whether to move all controls to the tab bar (complex, content-script-side) or slim the iframe header (simpler, keeps controls in React). The locked decision D-04 leans toward full removal.

2. **What is the exact DOM location of Twitch widgets relative to `.chat-shell`?**
   - What we know: Native Twitch places channel points at the bottom of `.chat-shell`, transient widgets at the top (above the message list).
   - What's unclear: Are they direct children of `.chat-shell` or nested? Do they appear inside the same container as the message list or as siblings?
   - Recommendation: Implementer must inspect live Twitch DOM before writing extraction code.

3. **How should the tab bar communicate connection state to/from the iframe?**
   - What we know: Connection state (connected/connecting/failed) is currently displayed via a dot in the iframe header.
   - What's unclear: If the header is removed, how does the tab bar show connection status without becoming a bidirectional postMessage relay for UI state?
   - Recommendation: Either retain a minimal header inside the iframe (connection dot only) or have the content script listen to `CONNECTION_STATE` postMessages from the iframe and update a DOM element in the tab bar.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 7 is purely content script + React code changes with no external service dependencies beyond what already exists (Playwright, npm, webpack all verified present in prior phases).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright ^1.59.1 |
| Config file | `playwright.config.ts` (root) |
| Quick run command | `npx playwright test tests/test-tab-bar.spec.ts tests/test-widget-zones.spec.ts --grep-invert @agent` |
| Full suite command | `npm test` (runs all non-@agent tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WIDGET-01 | Tab bar appears in `.chat-shell` on Twitch pages | E2E | `npx playwright test tests/test-tab-bar.spec.ts` | No — Wave 0 |
| WIDGET-02 | Clicking "Twitch Chat" tab hides AllChat iframe and shows native chat | E2E | `npx playwright test tests/test-tab-bar.spec.ts` | No — Wave 0 |
| WIDGET-03 | Clicking "AllChat" tab restores AllChat iframe and hides native chat | E2E | `npx playwright test tests/test-tab-bar.spec.ts` | No — Wave 0 |
| WIDGET-04 | Tab bar persists when native chat tab is active | E2E | `npx playwright test tests/test-tab-bar.spec.ts` | No — Wave 0 |
| WIDGET-05 | Widget zones injected into `.chat-shell` DOM | E2E | `npx playwright test tests/test-widget-zones.spec.ts` | No — Wave 0 |
| WIDGET-06 | Channel points widget clone appears in bottom zone | E2E (mock fixture) | `npx playwright test tests/test-widget-zones.spec.ts` | No — Wave 0 |
| WIDGET-07 | Transient widget clone appears/disappears with original | E2E (mock fixture) | `npx playwright test tests/test-widget-zones.spec.ts` | No — Wave 0 |
| WIDGET-08 | Existing test suite still passes (no regressions) | E2E | `npm test` | Yes |

**Manual-only tests (no automation path):**
- Real channel points interactivity (click forwarding on live Twitch) — live Twitch cannot be mocked without breaking the extension's streamer API check
- Real prediction/poll widget rendering — requires a broadcaster to run a live prediction

### Sampling Rate

- Per task commit: `npx playwright test tests/test-tab-bar.spec.ts tests/test-widget-zones.spec.ts --grep-invert @agent`
- Per wave merge: `npm test` (full non-agent suite)
- Phase gate: Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/test-tab-bar.spec.ts` — covers WIDGET-01 through WIDGET-04
- [ ] `tests/test-widget-zones.spec.ts` — covers WIDGET-05 through WIDGET-07
- [ ] `tests/fixtures/twitch-mock.html` — add mock widget elements (channel points zone, a fake prediction card) so fixture-based tests can exercise widget detection without live Twitch

---

## Security Domain

Phase 7 operates entirely within the existing Chrome extension security model — no new permissions, no new origins, no external requests. The content script already runs in the Twitch page context with existing host_permissions. No new ASVS categories apply beyond what prior phases have established.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Yes (minimal) | Widget elements cloned from Twitch's own DOM — no user input processed |
| V6 Cryptography | No | — |

**DOM injection safety:** Cloned nodes come from Twitch's own DOM (controlled by Twitch's React app) and are re-inserted into the same document. No user-controlled strings are inserted as HTML. No XSS vector introduced.

---

## Sources

### Primary (HIGH confidence)
- `/home/caesar/git/all-chat-extension/src/content-scripts/twitch.ts` — Existing switch handler and CSS hide pattern
- `/home/caesar/git/all-chat-extension/src/content-scripts/base/PlatformDetector.ts` — Button injection and teardown patterns
- `/home/caesar/git/all-chat-extension/src/ui/components/ChatContainer.tsx` — Header layout to be replaced
- `/home/caesar/git/all-chat-extension/.planning/phases/07-twitch-native-widget-extraction/07-CONTEXT.md` — Locked decisions

### Secondary (MEDIUM confidence)
- [MDN: Node.cloneNode()](https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode) — Confirmed: cloneNode does NOT copy addEventListener listeners
- [native-injection-research.md](../../../notes/native-injection-research.md) — 7TV/BTTV/FFZ approach: React Fiber hooking vs. clone approach
- [github.com/Ephellon/b89178a1a8ab5c5f2742a75a59457605](https://gist.github.com/Ephellon/b89178a1a8ab5c5f2742a75a59457605) — community-points-summary data-test-selector

### Tertiary (LOW confidence — verify against live Twitch)
- [github.com/sangshrestha/twitch-prediction](https://github.com/sangshrestha/twitch-prediction) — `copo-balance-string` selector
- [github.com/DMIPYA/twitch-points-collector](https://github.com/DMIPYA/twitch-points-collector) — `button[data-test-selector*="claim"]`
- Training knowledge: predictions/polls/hype train selectors (unverified, treat as hypotheses)

---

## Metadata

**Confidence breakdown:**
- Tab bar layout: HIGH — follows established patterns; pure DOM injection same as prior phases
- Widget zone layout: HIGH — pure CSS flex composition, no new techniques
- Clone + event forwarding mechanism: MEDIUM — `dispatchEvent` on React elements is assumed to work; must verify during implementation
- Twitch widget selectors: LOW — community sources only; must verify against live Twitch before implementation
- Test strategy: HIGH — Playwright infrastructure fully established; mock fixture approach matches prior phases

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 for tab bar / layout patterns (stable). Twitch selectors: verify fresh at implementation time regardless of date.
