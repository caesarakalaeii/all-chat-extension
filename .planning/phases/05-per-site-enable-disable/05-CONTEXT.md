# Phase 5: Per-site Enable/Disable - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the single global enable/disable toggle with per-platform controls. Users can independently enable or disable AllChat on Twitch, YouTube, and Kick. The global `extensionEnabled` boolean is replaced by three platform-specific booleans. Content scripts, popup, and icon badge all update to reflect per-platform state.

</domain>

<decisions>
## Implementation Decisions

### Granularity
- **D-01:** Per-platform granularity only (Twitch, YouTube, Kick). No per-channel control. Three booleans in `SyncStorage`.
- **D-02:** Remove the `extensionEnabled` global boolean from `SyncStorage`. Replace with `platformEnabled: { twitch: boolean, youtube: boolean, kick: boolean }`.

### User Controls
- **D-03:** Replace the single global toggle in the popup with three per-platform toggles (Twitch, YouTube, Kick), each with the platform icon and name.
- **D-04:** Toggling a platform takes effect immediately via `EXTENSION_STATE_CHANGED` message — no tab reload. Existing content scripts already handle this message pattern.
- **D-05:** The popup highlights the current tab's platform row (e.g., bold/accent the Twitch toggle when viewing twitch.tv). Use `current_platform` from `chrome.storage.session` (already stored by content scripts).

### Default Behavior
- **D-06:** All three platforms enabled by default on fresh install. Matches current behavior where `extensionEnabled` defaults to `true`.

### State Feedback
- **D-07:** Extension icon uses grayscale when AllChat is disabled for the current tab's platform. Normal (color) icon when enabled. This avoids conflicting with existing connection state badges (checkmark/X/exclamation).
- **D-08:** No separate "OFF" text badge — the grayscale icon is sufficient visual feedback.

### Claude's Discretion
- Storage migration strategy: how to handle existing users who have `extensionEnabled` but no `platformEnabled` (backwards compatibility)
- Exact popup layout/styling for the three toggles (use existing design system tokens)
- Icon grayscale implementation approach (CSS filter on icon vs separate grayscale icon asset)
- Whether to notify content scripts individually (only the affected platform) or broadcast to all tabs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Storage & Types
- `src/lib/types/extension.ts` — Defines `SyncStorage`, `DEFAULT_SETTINGS`, `LocalStorage` interfaces — the schema that must be modified
- `src/lib/storage.ts` — Chrome storage API wrappers (`getSyncStorage`, `setSyncStorage`) — may need new per-platform helpers

### Content Scripts
- `src/content-scripts/twitch.ts` — Checks `extensionEnabled` before injection, handles `EXTENSION_STATE_CHANGED`
- `src/content-scripts/youtube.ts` — Same pattern as Twitch, plus `handleExtensionStateChange()` function
- `src/content-scripts/youtube-studio.ts` — Same pattern, YouTube Studio variant
- `src/content-scripts/kick.ts` — Same pattern for Kick

### Popup
- `src/popup/popup.tsx` — Current global toggle implementation, `handleToggle()`, platform detection via `current_platform` session storage

### Service Worker
- `src/background/service-worker.ts` — Sets extension badge, broadcasts state changes

### Design System
- `src/ui/styles.css` — Design tokens (OkLCh colors, typography) for consistent styling

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SyncStorage.preferences` object already groups related settings — `platformEnabled` follows the same pattern
- `handleExtensionStateChange(enabled: boolean)` exists in all content scripts — needs a minor refactor to check platform-specific state
- `chrome.storage.session` already stores `current_platform` — popup can read this for highlighting
- Toggle switch CSS exists in popup stylesheet (`.toggle-switch`, `.toggle-slider`)
- Platform icons already implemented in popup (`PlatformIcon` component)

### Established Patterns
- Settings use `chrome.storage.sync` (syncs across devices)
- Content scripts listen for `EXTENSION_STATE_CHANGED` via `chrome.runtime.onMessage`
- Popup reads settings on mount via `getSyncStorage()`, writes via `setSyncStorage()`
- Badge is set via `chrome.action.setBadgeText` / `chrome.action.setBadgeBackgroundColor` in service worker

### Integration Points
- `SyncStorage` type + `DEFAULT_SETTINGS` constant — single point of change for storage schema
- Each content script's init function checks `settings.extensionEnabled` — change to `settings.platformEnabled[platform]`
- Popup's `handleToggle()` — replace with per-platform toggle handlers
- Service worker badge logic — add platform awareness for grayscale icon

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for the implementation details marked as Claude's Discretion.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-per-site-enable-disable*
*Context gathered: 2026-04-03*
