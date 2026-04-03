# ADR 005: Replace extensionEnabled with platformEnabled Storage Schema

**Status: Accepted**
**Date: 2026-04-03**

## Context

The extension uses a single `extensionEnabled: boolean` field in `chrome.storage.sync` to control whether AllChat injects on all platforms. Phase 5 requires per-platform granularity (D-01, D-02): users must be able to disable AllChat on Twitch without affecting YouTube or Kick.

The existing codebase has nine references to `extensionEnabled` across content scripts, the popup, and the service worker. All four content scripts (twitch.ts, youtube.ts, youtube-studio.ts, kick.ts) read `settings.extensionEnabled` on initialization. The popup reads and writes it to control the global toggle. The service worker's `onInstalled` handler writes `DEFAULT_SETTINGS` directly.

Existing users have `extensionEnabled` stored in their Chrome sync storage. A migration strategy is required to ensure their settings are preserved when the extension updates.

## Decision

Replace `extensionEnabled: boolean` with `platformEnabled: { twitch: boolean, youtube: boolean, kick: boolean }` in `SyncStorage`.

A new exported type `PlatformEnabled` captures the shape for use across the codebase.

### Migration Strategy

Migration runs at read time in `getSyncStorage()`:

1. When `platformEnabled` is absent but `extensionEnabled` exists in storage, map the legacy boolean to all three platforms (preserving the user's intent: if they had AllChat globally disabled, all three platforms become disabled; if enabled, all three remain enabled).
2. The migrated value is written back to storage (fire-and-forget) so subsequent reads find the new schema.
3. The legacy `extensionEnabled` key is removed from the returned object and from `chrome.storage.sync` after migration.
4. Deep-merge is applied when `platformEnabled` exists but has missing keys (e.g., a user who stored `{ twitch: false }` without `youtube`/`kick` keys gets defaults filled in).

Migration is idempotent: if two parallel reads trigger it simultaneously, both writes produce the same result.

### Default Values

`DEFAULT_SETTINGS.platformEnabled` defaults all three platforms to `true` (D-06: all platforms enabled by default on fresh install).

### Icon Feedback

Pre-generated grayscale PNG icon assets (`icon-{16,32,48,128}-gray.png`) are used to indicate when AllChat is disabled for the current tab's platform. This avoids the need for `OffscreenCanvas` in the service worker (D-07, D-08).

## Consequences

- Existing users are transparently migrated on first storage read after the extension updates. No action required from users.
- Migration is idempotent — safe if triggered by multiple parallel reads on first load.
- The `extensionEnabled` key is cleaned up from storage after migration, keeping storage tidy.
- All consumers of `getSyncStorage()` must use `settings.platformEnabled[platform]` instead of `settings.extensionEnabled`. This is a compile-time change enforced by TypeScript (removing the field from the `SyncStorage` interface causes tsc errors at all callsites).
- New platforms can be added by extending the `PlatformEnabled` type and `DEFAULT_SETTINGS`.
- The popup requires a redesign (plan 05-03) to show three per-platform toggles instead of the single global toggle.
- Content scripts require re-enable paths (plan 05-02) since D-04 removes the `chrome.tabs.reload()` fallback.

## Alternatives Considered

### Migrate only in onInstalled

Pros: Runs once on update, not on every read.
Cons: Race condition if content scripts read storage before `onInstalled` completes. Read-time migration is more defensive and covers all code paths.

### Keep extensionEnabled as an alias

Pros: No migration needed.
Cons: Defeats the purpose of per-platform granularity. Creates confusing dual-truth for callers.

### OffscreenCanvas for runtime grayscale

Pros: No extra asset files.
Cons: Complex, requires DOM-like APIs in service workers. Pre-generated PNGs are simpler and robust across all Chrome versions.
