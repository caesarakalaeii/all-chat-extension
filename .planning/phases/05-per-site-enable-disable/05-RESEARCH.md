# Phase 5: Per-site Enable/Disable - Research

**Researched:** 2026-04-03
**Domain:** Chrome Extension MV3 — storage schema migration, popup UI, content script messaging, icon API
**Confidence:** HIGH

## Summary

This phase replaces the single global `extensionEnabled` boolean in `SyncStorage` with a `platformEnabled: { twitch, youtube, kick }` object. Every decision is locked in CONTEXT.md. The research task is to map all code that touches `extensionEnabled` and establish safe patterns for each discrete change.

The codebase is small and internally consistent. All four content scripts (twitch, youtube, youtube-studio, kick) follow the identical pattern: read `settings.extensionEnabled` on init, and respond to `EXTENSION_STATE_CHANGED` messages in their `handleExtensionStateChange(enabled: boolean)` function. The popup currently uses a page-reload strategy instead of the `EXTENSION_STATE_CHANGED` message path — D-04 (no tab reload) requires implementing that broadcast in the service worker for the first time.

The storage migration (backward compat for existing users who have `extensionEnabled` but no `platformEnabled`) is the only discretion area with meaningful implementation risk. The grayscale icon approach (CSS filter vs. separate asset) is a low-stakes styling decision.

**Primary recommendation:** Implement migration at `getSyncStorage()` call time by detecting the absence of `platformEnabled` and writing defaults before returning — this keeps all migration logic in one place and runs transparently for all callers.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Per-platform granularity only (Twitch, YouTube, Kick). No per-channel control. Three booleans in `SyncStorage`.
- **D-02:** Remove the `extensionEnabled` global boolean from `SyncStorage`. Replace with `platformEnabled: { twitch: boolean, youtube: boolean, kick: boolean }`.
- **D-03:** Replace the single global toggle in the popup with three per-platform toggles (Twitch, YouTube, Kick), each with the platform icon and name.
- **D-04:** Toggling a platform takes effect immediately via `EXTENSION_STATE_CHANGED` message — no tab reload. Existing content scripts already handle this message pattern.
- **D-05:** The popup highlights the current tab's platform row (e.g., bold/accent the Twitch toggle when viewing twitch.tv). Use `current_platform` from `chrome.storage.session` (already stored by content scripts).
- **D-06:** All three platforms enabled by default on fresh install.
- **D-07:** Extension icon uses grayscale when AllChat is disabled for the current tab's platform. Normal (color) icon when enabled. Avoids conflicting with existing connection state badges.
- **D-08:** No separate "OFF" text badge — grayscale icon is sufficient visual feedback.

### Claude's Discretion

- Storage migration strategy: how to handle existing users who have `extensionEnabled` but no `platformEnabled` (backwards compatibility)
- Exact popup layout/styling for the three toggles (use existing design system tokens)
- Icon grayscale implementation approach (CSS filter on icon vs separate grayscale icon asset)
- Whether to notify content scripts individually (only the affected platform) or broadcast to all tabs

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Standard Stack

This phase introduces no new dependencies. All tools are already present.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Chrome Extension APIs | MV3 | `chrome.storage.sync`, `chrome.action`, `chrome.tabs` | Extension platform |
| React | 18.3.0 | Popup UI | Already used |
| TypeScript | 5.3.3 | Type safety | Already used |

### No new installs required

All APIs used (storage migration, action icon, tab messaging) are built into MV3. No `npm install` needed.

---

## Architecture Patterns

### Code change map — every file that must be modified

| File | Change required |
|------|----------------|
| `src/lib/types/extension.ts` | Remove `extensionEnabled: boolean`. Add `platformEnabled: { twitch: boolean, youtube: boolean, kick: boolean }`. Update `DEFAULT_SETTINGS`. |
| `src/lib/storage.ts` | Add migration logic. Optionally add per-platform helper. |
| `src/content-scripts/twitch.ts` | `initialize()`: read `settings.platformEnabled.twitch`. `handleExtensionStateChange()`: receives the enabled value already — no signature change needed. |
| `src/content-scripts/youtube.ts` | Same as twitch — read `settings.platformEnabled.youtube`. |
| `src/content-scripts/youtube-studio.ts` | Same — read `settings.platformEnabled.youtube`. |
| `src/content-scripts/kick.ts` | Same — read `settings.platformEnabled.kick`. |
| `src/popup/popup.tsx` | Replace single toggle with three per-platform toggles. Add platform-highlight logic using `current_platform`. Remove page-reload approach. |
| `src/background/service-worker.ts` | (a) Update `onInstalled` handler to write new defaults. (b) Add `EXTENSION_STATE_CHANGED` broadcast targeted to only the affected platform's tabs. (c) Add grayscale icon logic responding to platform enable state. |

---

### Pattern 1: Storage Schema Migration (Claude's Discretion — recommended approach)

**What:** On `getSyncStorage()`, detect legacy state (`extensionEnabled` present, `platformEnabled` absent) and perform a one-time migration to the new schema.

**When to use:** Every call to `getSyncStorage()` needs safe values, and this is the single call point for all consumers.

**Recommended implementation in `src/lib/storage.ts`:**

```typescript
// After chrome.storage.sync.get resolves, before returning:
if (!items.platformEnabled) {
  // Migrate: pre-existing users had extensionEnabled (default true)
  // Map legacy value to all three platforms, or default all to true
  const legacyEnabled = (items as any).extensionEnabled ?? true;
  const migrated = {
    twitch: legacyEnabled,
    youtube: legacyEnabled,
    kick: legacyEnabled,
  };
  // Write migration synchronously (fire-and-forget is acceptable here)
  chrome.storage.sync.set({ platformEnabled: migrated });
  items.platformEnabled = migrated;
}
// Remove legacy key from returned object — callers never see extensionEnabled
delete (items as any).extensionEnabled;
```

**Why this approach:** Migration runs at read time rather than requiring a separate `onInstalled` update handler. The `onInstalled` handler should also write the new defaults for fresh installs. Both cover the bases.

**Alternative (less recommended):** Migrate only in `onInstalled` `reason === 'update'`. Risk: if `onInstalled` fires before content scripts read settings (unlikely but possible in race), the old key is still present. Read-time migration is more defensive.

---

### Pattern 2: Content Script Init Check (identical for all four scripts)

**Current code (all four scripts):**
```typescript
// src/content-scripts/twitch.ts (and youtube.ts, youtube-studio.ts, kick.ts)
const settings = await getSyncStorage();
if (!settings.extensionEnabled) {
  console.log('[AllChat Twitch] Extension is disabled, not injecting');
  return;
}
```

**New code (per-platform lookup):**
```typescript
const settings = await getSyncStorage();
if (!settings.platformEnabled.twitch) {   // replace 'twitch' per script
  console.log('[AllChat Twitch] Extension disabled for Twitch, not injecting');
  return;
}
```

No other changes needed in `handleExtensionStateChange(enabled: boolean)` — it already receives a boolean and acts on it.

---

### Pattern 3: Popup Per-Platform Toggles (replaces single toggle)

**Current popup state:** `isEnabled: boolean` driven by `settings.extensionEnabled`.

**New popup state:**
```typescript
const [platformEnabled, setPlatformEnabled] = useState({
  twitch: true,
  youtube: true,
  kick: true,
});
```

**Load on mount:**
```typescript
const settings = await getSyncStorage();
setPlatformEnabled(settings.platformEnabled);
```

**Per-platform toggle handler:**
```typescript
const handlePlatformToggle = async (platform: 'twitch' | 'youtube' | 'kick') => {
  const newState = { ...platformEnabled, [platform]: !platformEnabled[platform] };
  setPlatformEnabled(newState);
  await setSyncStorage({ platformEnabled: newState });
  // Broadcast to affected tabs only (see Pattern 4)
  await broadcastPlatformState(platform, newState[platform]);
};
```

**Platform row JSX structure (use existing CSS classes):**
```tsx
{(['twitch', 'youtube', 'kick'] as const).map((p) => (
  <div key={p} className={`platform-row ${currentPlatform === p ? 'platform-row--active' : ''}`}>
    <PlatformIcon platform={p} />
    <span>{platformLabel[p]}</span>
    <label className="toggle-switch">
      <input
        type="checkbox"
        checked={platformEnabled[p]}
        onChange={() => handlePlatformToggle(p)}
        disabled={isLoading}
      />
      <span className="toggle-slider"></span>
    </label>
  </div>
))}
```

**Active row highlight:** Add CSS rule using existing design tokens:
```css
.platform-row--active {
  font-weight: 600;
  /* Or use a left border accent matching the platform color */
}
```

---

### Pattern 4: Sending EXTENSION_STATE_CHANGED (Service Worker)

**Critical finding:** The service worker currently NEVER sends `EXTENSION_STATE_CHANGED` messages. The content scripts listen for it (all four have the handler wired in `setupGlobalMessageRelay`) but the sender does not exist yet.

The current popup uses `chrome.tabs.reload()` for every affected tab — D-04 removes this in favor of messaging.

**New approach in service worker (or called from popup via message):**

Option A — Popup calls service worker via new message type, service worker does the fan-out:
```typescript
// New message type: TOGGLE_PLATFORM_ENABLED
case 'TOGGLE_PLATFORM_ENABLED': {
  const { platform, enabled } = message;
  await setSyncStorage({ platformEnabled: { ...current, [platform]: enabled } });
  const urlMap = {
    twitch: ['https://www.twitch.tv/*'],
    youtube: ['https://www.youtube.com/*', 'https://studio.youtube.com/*'],
    kick: ['https://kick.com/*'],
  };
  const tabs = await chrome.tabs.query({ url: urlMap[platform] });
  await Promise.allSettled(tabs.filter(t => t.id).map(t =>
    chrome.tabs.sendMessage(t.id!, { type: 'EXTENSION_STATE_CHANGED', enabled })
  ));
  sendResponse({ success: true });
  break;
}
```

Option B — Popup writes storage and sends the tab messages directly (simpler, fewer moving parts):
```typescript
// In popup handlePlatformToggle
await setSyncStorage({ platformEnabled: newState });
const tabs = await chrome.tabs.query({ url: urlsForPlatform(platform) });
await Promise.allSettled(tabs.filter(t => t.id).map(t =>
  chrome.tabs.sendMessage(t.id!, {
    type: 'EXTENSION_STATE_CHANGED',
    enabled: newState[platform]
  }).catch(() => {})
));
```

**Recommendation:** Option B (popup sends directly) keeps the service worker thin. Popup already has `chrome.tabs` access in MV3. The service worker does not need a new message type.

---

### Pattern 5: Grayscale Icon (Claude's Discretion — recommended approach)

**D-07:** Grayscale icon when platform is disabled for current tab.

**Option A — CSS filter (dynamic, no extra assets):**
```typescript
// In service worker, when popup signals a platform state change
// or when the popup opens and reads current platform + its state

// Chrome action icon path is set per-tab
chrome.action.setIcon({
  tabId: tab.id,
  imageData: grayscaleImageData,  // computed from the color icon
});
```

Limitation: `chrome.action.setIcon` with `imageData` requires creating a canvas in the service worker — service workers have no DOM access. This approach requires an `OffscreenCanvas`.

**Option B — Pre-generated grayscale icon assets (simpler):**
Create `assets/icon-16-gray.png`, `icon-32-gray.png`, `icon-48-gray.png`, `icon-128-gray.png`. Toggle between color and grayscale using `chrome.action.setIcon({ tabId, path: grayPath })`.

**Recommendation:** Option B (pre-generated grayscale assets). `OffscreenCanvas` works in service workers in Chrome 100+ but adds complexity without benefit. Four grayscale PNGs are trivial to add and the pattern is robust.

**When to update the icon:**

The icon must update when:
1. Popup toggles a platform (iterate over that platform's open tabs, set icon per-tab)
2. User navigates to a platform tab (content script fires `SET_CURRENT_PLATFORM` — service worker already handles this and could read `platformEnabled` at that point to set the icon)

**Icon update logic in service worker:**
```typescript
case 'SET_CURRENT_PLATFORM':
  await chrome.storage.session.set({ current_platform: message.platform });
  // Update icon for this tab based on platform's enabled state
  const settings = await getSyncStorage();
  const enabled = settings.platformEnabled[message.platform as keyof typeof settings.platformEnabled] ?? true;
  const iconPath = enabled
    ? { 16: 'assets/icon-16.png', 32: 'assets/icon-32.png' }
    : { 16: 'assets/icon-16-gray.png', 32: 'assets/icon-32-gray.png' };
  if (sender.tab?.id) {
    chrome.action.setIcon({ tabId: sender.tab.id, path: iconPath });
  }
  sendResponse({ success: true });
  break;
```

Note: `sender.tab?.id` is available in the service worker message handler when the sender is a content script.

---

### Anti-Patterns to Avoid

- **Reading `extensionEnabled` after migration:** After this phase ships, no code should reference `extensionEnabled`. Remove all references rather than aliasing.
- **Reloading tabs on toggle:** D-04 explicitly forbids this. The `chrome.tabs.reload()` call in the current popup `handleToggle` must be removed entirely.
- **Broadcasting to all platforms when one changes:** When Twitch is toggled, only query Twitch tabs. Don't reload or message YouTube/Kick tabs unnecessarily.
- **Setting the icon without a tabId:** `chrome.action.setIcon` without `tabId` changes the global icon — fine for a "no platform" state but per-tab icon requires `tabId`. Always pass `tabId` when updating per-platform icon state.
- **youtube-studio.ts uses platform `'youtube'` not `'youtube-studio'`:** The content script stores `current_platform = 'youtube'`. The `platformEnabled` lookup must use `'youtube'` for both youtube.ts and youtube-studio.ts.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab URL filtering by platform | Custom URL-matching logic | `chrome.tabs.query({ url: ['https://www.twitch.tv/*'] })` | Built-in glob support; already used in service worker |
| Storage change listeners | Manual polling | `chrome.storage.onChanged` (if needed for reactive icon updates) | MV3 built-in; content scripts can subscribe |
| Grayscale image generation | Canvas/filter at runtime | Pre-generated PNG assets | No DOM in service workers; simpler build process |
| Per-platform type discrimination | String comparisons at call sites | TypeScript union type `'twitch' \| 'youtube' \| 'kick'` | Already defined in codebase as `PlatformInfo.platform` |

**Key insight:** Every "hard" problem in this phase already has a Chrome API or existing codebase pattern that solves it. This is a refactor, not a new feature.

---

## Common Pitfalls

### Pitfall 1: `handleExtensionStateChange` Re-enable Path

**What goes wrong:** Disabling works (teardown runs). Re-enabling has a note "handled by page reload" in all four scripts. Once D-04 removes the page reload, re-enabling via message requires calling `globalDetector?.init()` again — but `globalDetector` may be null after teardown.

**Why it happens:** The current design assumes the page reloads on re-enable. The message path was never wired for re-enable.

**How to avoid:** In each content script's `handleExtensionStateChange`, add the re-enable path:
```typescript
function handleExtensionStateChange(enabled: boolean) {
  if (!enabled) {
    globalDetector?.teardown();
    globalDetector = null;
  } else {
    // Re-enable: create detector and init if not already running
    if (!globalDetector) {
      globalDetector = new TwitchDetector();
      setupGlobalMessageRelay(); // already set up — listener is idempotent via onMessage
      globalDetector.init();
    }
  }
}
```

**Warning signs:** Toggle platform ON, chat iframe does not appear without page reload.

---

### Pitfall 2: `setupGlobalMessageRelay()` Called Twice on Re-enable

**What goes wrong:** If re-enable creates a new detector and calls `setupGlobalMessageRelay()` again, a second `chrome.runtime.onMessage.addListener` is registered. Chrome does not deduplicate listeners — messages get handled twice.

**Why it happens:** `chrome.runtime.onMessage.addListener` accumulates listeners.

**How to avoid:** Track whether the message relay is set up with a module-level boolean:
```typescript
let messageRelaySetup = false;

function setupGlobalMessageRelay() {
  if (messageRelaySetup) return;
  messageRelaySetup = true;
  chrome.runtime.onMessage.addListener(/* ... */);
}
```

**Warning signs:** Chat messages appear duplicated in the iframe on re-enable.

---

### Pitfall 3: `getSyncStorage()` Default Object Shape

**What goes wrong:** `chrome.storage.sync.get(DEFAULT_SETTINGS, callback)` merges stored values with the defaults. If `DEFAULT_SETTINGS.platformEnabled` is `{ twitch: true, youtube: true, kick: true }`, a user with only `{ twitch: false }` in storage would receive `{ twitch: false, youtube: true, kick: true }` — correct partial merge.

However, `chrome.storage.sync.get` merges at the top level only — it does NOT deep-merge nested objects. If the user's stored `platformEnabled` is `{ twitch: false }` (missing youtube and kick), the returned value is `{ twitch: false }`, not the default-merged result.

**Why it happens:** Chrome storage `get` with defaults only fills in missing top-level keys.

**How to avoid:** After getting storage, always spread defaults for the nested object:
```typescript
const stored = items.platformEnabled ?? {};
items.platformEnabled = {
  twitch: stored.twitch ?? true,
  youtube: stored.youtube ?? true,
  kick: stored.kick ?? true,
};
```

**Warning signs:** `settings.platformEnabled.youtube` is `undefined` for a user who had previously only stored `twitch`.

---

### Pitfall 4: Grayscale Icon and Connection Badge Conflict

**What goes wrong:** The service worker sets badge text (`✓`, `✗`, `!`) based on WebSocket connection state. If the icon is also changed per-tab for grayscale, they may conflict visually (grayscale icon with green checkmark is confusing).

**Why it happens:** D-07 specifically addresses this: grayscale vs. color icon is independent of badge text. The decision says to keep existing badges.

**How to avoid:** Keep badge logic untouched. Only `chrome.action.setIcon` changes. The grayscale icon with a badge is acceptable — it means "AllChat disabled on this platform, but connection state is tracked".

---

### Pitfall 5: Storage Migration Timing

**What goes wrong:** `getSyncStorage()` is called by both content scripts and the popup immediately on load. If migration writes during this read, and a second read happens before the write completes, both reads may try to migrate.

**Why it happens:** Two async reads in parallel before the migrated value is stored.

**How to avoid:** The migration write is idempotent — writing the same defaults twice is harmless. No lock needed. The only symptom is two storage writes on first run after update.

---

## Code Examples

### Verified: Current `extensionEnabled` references to replace

```
src/lib/types/extension.ts:64          extensionEnabled: boolean;
src/lib/types/extension.ts:72          extensionEnabled: true,
src/content-scripts/twitch.ts:150      if (!settings.extensionEnabled)
src/content-scripts/youtube.ts:250     if (!settings.extensionEnabled)
src/content-scripts/youtube-studio.ts:182  if (!settings.extensionEnabled)
src/content-scripts/kick.ts:180        if (!settings.extensionEnabled)
src/popup/popup.tsx:25                 setIsEnabled(settings.extensionEnabled)
src/popup/popup.tsx:43                 await setSyncStorage({ extensionEnabled: newState });
src/background/service-worker.ts:88    setSyncStorage(DEFAULT_SETTINGS);
```

All nine locations must be updated. The service worker `onInstalled` handler writes `DEFAULT_SETTINGS` directly — once `extensionEnabled` is removed from `DEFAULT_SETTINGS` and `platformEnabled` is added, the install handler is automatically correct.

### Verified: Current `handleExtensionStateChange` signatures (all four scripts)

```typescript
// twitch.ts:184 — teardown only, no re-enable path
function handleExtensionStateChange(enabled: boolean) {
  if (!enabled) { globalDetector?.teardown(); globalDetector = null; }
  // Note: Re-enabling is handled by page reload from popup
}

// youtube.ts:229 — calls removeAllChatUI + showNativeChat explicitly
function handleExtensionStateChange(enabled: boolean) {
  if (!enabled) {
    globalDetector?.removeAllChatUI();
    globalDetector?.showNativeChat();
    globalDetector = null;
  }
}

// youtube-studio.ts:164 — same as youtube.ts
// kick.ts:161 — same as twitch.ts (teardown only)
```

Note the asymmetry: twitch and kick use `teardown()` (which calls both `removeAllChatUI` and `showNativeChat` internally). YouTube scripts call both methods explicitly. All must gain re-enable paths.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `extensionEnabled: boolean` global | `platformEnabled: { twitch, youtube, kick }` | Phase 5 | 4 content scripts + popup + service worker must update |
| Page reload on toggle | `EXTENSION_STATE_CHANGED` message | Phase 5 | Requires re-enable path in content scripts |
| Sender-unknown EXTENSION_STATE_CHANGED | Service worker never sent this message | Phase 5 | Popup or service worker must start sending it |

**Deprecated after this phase:**
- `extensionEnabled` key in SyncStorage — remove from type, defaults, and all readers
- `chrome.tabs.reload()` in popup toggle handler — replace with message send

---

## Open Questions

1. **Re-enable path: `init()` reuse vs. full re-initialization**
   - What we know: `teardown()` disconnects observers and removes the container. `init()` can be called again.
   - What's unclear: Whether calling `init()` on an already-partially-initialized detector causes issues (e.g. duplicate URL watchers).
   - Recommendation: Check if `setupUrlWatcher()` and `setupChatTabWatcher()` are safe to call twice — if not, guard them with a module-level boolean like the relay guard above.

2. **Icon update on popup open vs. tab activation**
   - What we know: `chrome.storage.session.current_platform` tells us the current tab's platform.
   - What's unclear: Whether we need to update the icon proactively on popup open, or rely on the `SET_CURRENT_PLATFORM` message (already fires when content script loads).
   - Recommendation: The `SET_CURRENT_PLATFORM` path in the service worker is the right hook — update icon there. No additional popup-open hook needed unless there's an edge case where the icon is stale.

---

## Environment Availability

Step 2.6: SKIPPED — This phase is a pure code refactor with no external dependencies beyond the existing Node.js/webpack/Playwright toolchain already verified by previous phases.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 |
| Config file | `playwright.config.ts` |
| Quick run command | `npx playwright test --grep-invert @agent` |
| Full suite command | `npx playwright test --grep-invert @agent` |

### Phase Requirements → Test Map

No formal requirement IDs are defined for this phase (TBD in planning). The behaviors to cover:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Platform toggle disables injection on that platform | E2E (Playwright) | `npx playwright test tests/test-per-site-enable.spec.ts` | No — Wave 0 |
| Platform toggle re-enables injection without page reload | E2E (Playwright) | `npx playwright test tests/test-per-site-enable.spec.ts` | No — Wave 0 |
| Unaffected platforms remain active when one is disabled | E2E (Playwright) | `npx playwright test tests/test-per-site-enable.spec.ts` | No — Wave 0 |
| Storage migration: legacy `extensionEnabled` → `platformEnabled` | Unit (can mock storage) | `npx playwright test tests/test-storage-migration.spec.ts` | No — Wave 0 |
| Current platform row highlighted in popup | E2E (Playwright) | `npx playwright test tests/test-per-site-enable.spec.ts` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npx playwright test --grep-invert @agent`
- **Per wave merge:** `npx playwright test --grep-invert @agent`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test-per-site-enable.spec.ts` — main behavioral spec for toggle on/off per platform
- [ ] `tests/test-storage-migration.spec.ts` — covers legacy `extensionEnabled` migration

**Existing fixture infrastructure is reusable.** `launchExtensionContext()` and fixture HTML files (twitch-mock.html, kick-mock.html) are already set up in previous phases. New tests follow the same pattern.

**Note on test strategy:** The popup toggle interaction can be tested by opening the extension popup page directly (`chrome.extension.getURL('popup/popup.html')`) via `context.newPage()` and interacting with the toggle checkboxes. Chrome extension popups are accessible as normal pages in Playwright's persistent context.

---

## Project Constraints (from CLAUDE.md)

Global `~/.claude/CLAUDE.md` applies (no project-level CLAUDE.md found). Relevant directives:

- Use conventional commits
- NEVER commit with a co-author line unless asked
- Architectural changes need to be verified against ADRs — if none exist, create them. **This phase changes the storage schema, which is an architectural change. An ADR should document the `extensionEnabled` → `platformEnabled` migration decision.**
- Use Test Driven Development — write tests before/alongside implementation
- If possible create end to end tests (Playwright is already the project's test framework)
- NEVER disable a feature without permission — toggling a platform off is a user-controlled feature, not a feature disable. Compliant.
- ALWAYS keep README.md up to date — check if README mentions the global toggle and update accordingly

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/lib/types/extension.ts`, `src/lib/storage.ts`, `src/popup/popup.tsx`, `src/background/service-worker.ts`
- Direct code inspection: all four content scripts (`twitch.ts`, `youtube.ts`, `youtube-studio.ts`, `kick.ts`)
- Chrome MV3 API knowledge (verified against existing patterns in codebase): `chrome.action.setIcon`, `chrome.tabs.query`, `chrome.storage.sync`
- `05-CONTEXT.md` — locked decisions from user discussion

### Secondary (MEDIUM confidence)
- Chrome MV3 `chrome.action.setIcon` tab-level API behavior (per-tab icon distinct from global icon)
- `chrome.storage.sync.get` shallow merge behavior for nested objects

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Storage schema change: HIGH — all affected files identified by code inspection
- Content script re-enable path: HIGH — missing code explicitly confirmed by reading all four scripts
- Grayscale icon (pre-generated PNG): HIGH — service worker DOM constraints well understood
- Storage migration timing: MEDIUM — shallow-merge behavior confirmed by MV3 knowledge but not tested against this specific schema shape

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable APIs; no fast-moving dependencies)
