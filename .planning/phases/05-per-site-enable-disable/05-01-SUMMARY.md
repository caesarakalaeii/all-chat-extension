---
phase: 05-per-site-enable-disable
plan: 01
subsystem: storage
tags: [chrome-extension, typescript, storage-migration, platform-toggle]

# Dependency graph
requires:
  - phase: 04-llm-test-infrastructure
    provides: Playwright test infrastructure and extension context fixture

provides:
  - PlatformEnabled type alias for per-platform boolean storage
  - Updated SyncStorage interface with platformEnabled replacing extensionEnabled
  - Migration-aware getSyncStorage with legacy extensionEnabled -> platformEnabled
  - Grayscale icon PNGs (16/32/48/128px) for disabled-platform icon state
  - ADR 005 documenting storage schema migration decision

affects: [05-02, 05-03, 05-04, all content scripts, popup, service worker]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Read-time storage migration with fire-and-forget persistence
    - Deep-merge defaults for nested Chrome sync storage objects
    - TDD fs-based tests to verify type and code structure without a browser

key-files:
  created:
    - assets/icon-16-gray.png
    - assets/icon-32-gray.png
    - assets/icon-48-gray.png
    - assets/icon-128-gray.png
    - docs/adr/005-platform-enabled-storage-migration.md
  modified:
    - src/lib/types/extension.ts
    - src/lib/storage.ts
    - src/content-scripts/twitch.ts
    - src/content-scripts/youtube.ts
    - src/content-scripts/youtube-studio.ts
    - src/content-scripts/kick.ts
    - src/popup/popup.tsx
    - tests/test-per-site-enable.spec.ts
    - tests/test-storage-migration.spec.ts

key-decisions:
  - "Read-time migration: getSyncStorage detects absent platformEnabled and maps legacy extensionEnabled to all three platforms"
  - "Deep-merge applied on every read to handle partial platformEnabled objects from older schema versions"
  - "Pre-generated grayscale PNGs via ImageMagick chosen over OffscreenCanvas runtime approach"
  - "Popup handleToggle sets all three platforms together as a bridge until per-platform redesign in plan 05-03"
  - "EXTENSION_STATE_CHANGED added to ExtensionMessage union (was handled but not typed)"

patterns-established:
  - "Pattern: Read-time storage migration with fire-and-forget persistence for idempotent schema upgrade"
  - "Pattern: fs-based TDD tests read source files to assert structural requirements without browser"

requirements-completed: [D-01, D-02, D-06]

# Metrics
duration: 4min
completed: 2026-04-03
---

# Phase 05 Plan 01: Storage Foundation Summary

**PlatformEnabled type with read-time migration from extensionEnabled, grayscale icon assets, and ADR 005 — storage foundation for per-platform enable/disable**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T13:46:06Z
- **Completed:** 2026-04-03T13:50:30Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Replaced `extensionEnabled: boolean` with `platformEnabled: PlatformEnabled` in `SyncStorage` — TypeScript now enforces per-platform access at all callsites
- Migration logic in `getSyncStorage()` transparently upgrades existing users: legacy `extensionEnabled` value maps to all three platforms, with fire-and-forget persistence and cleanup
- Generated four grayscale PNG icon assets (16/32/48/128px) for the disabled-platform icon state
- Created `docs/adr/005-platform-enabled-storage-migration.md` per CLAUDE.md requirement for architectural changes
- All four content scripts updated to read `settings.platformEnabled[platform]` instead of `settings.extensionEnabled`
- Popup bridged to use `platformEnabled` (sets all three together) until per-platform UI redesign in plan 03

## Task Commits

Each task was committed atomically:

1. **Task 1: Update SyncStorage type and DEFAULT_SETTINGS with platformEnabled** - `5d82860` (feat)
2. **Task 2: Add migration logic to getSyncStorage, generate grayscale icons, and create ADR** - `0ce516a` (feat)

## Files Created/Modified

- `src/lib/types/extension.ts` - Added `PlatformEnabled` type, replaced `extensionEnabled` with `platformEnabled`, added `EXTENSION_STATE_CHANGED` to `ExtensionMessage` union
- `src/lib/storage.ts` - Migration logic in `getSyncStorage()`: legacy migration, deep-merge, cleanup
- `src/content-scripts/twitch.ts` - Reads `settings.platformEnabled.twitch`
- `src/content-scripts/youtube.ts` - Reads `settings.platformEnabled.youtube`
- `src/content-scripts/youtube-studio.ts` - Reads `settings.platformEnabled.youtube`
- `src/content-scripts/kick.ts` - Reads `settings.platformEnabled.kick`
- `src/popup/popup.tsx` - Derives `isEnabled` from `platformEnabled`, sets all three on toggle, sends `EXTENSION_STATE_CHANGED` instead of reloading tabs
- `assets/icon-16-gray.png` - Grayscale 16px icon
- `assets/icon-32-gray.png` - Grayscale 32px icon
- `assets/icon-48-gray.png` - Grayscale 48px icon
- `assets/icon-128-gray.png` - Grayscale 128px icon
- `docs/adr/005-platform-enabled-storage-migration.md` - ADR for storage schema change
- `tests/test-per-site-enable.spec.ts` - TDD tests for type-level requirements
- `tests/test-storage-migration.spec.ts` - TDD tests for migration behavior and file existence

## Decisions Made

- Read-time migration chosen over `onInstalled` handler: more defensive, covers all code paths including parallel reads
- Deep-merge on every `getSyncStorage()` call: handles future schema additions where stored object may be missing new keys
- Pre-generated grayscale PNGs: simpler than `OffscreenCanvas` approach, no DOM required in service worker
- Popup bridge (all-three toggle): keeps popup functional until plan 05-03 redesign with per-platform toggles

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated all four content scripts to use platformEnabled**
- **Found during:** Task 1 (SyncStorage type change)
- **Issue:** Removing `extensionEnabled` from `SyncStorage` caused TypeScript compile errors in all four content scripts (`twitch.ts`, `youtube.ts`, `youtube-studio.ts`, `kick.ts`) and `popup.tsx` — these files still referenced `settings.extensionEnabled`
- **Fix:** Updated each content script to read `settings.platformEnabled[platform]` per the research patterns. Updated popup to derive `isEnabled` from `platformEnabled` and write all three platforms on toggle
- **Files modified:** `src/content-scripts/twitch.ts`, `src/content-scripts/youtube.ts`, `src/content-scripts/youtube-studio.ts`, `src/content-scripts/kick.ts`, `src/popup/popup.tsx`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `5d82860` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking TypeScript errors from removing extensionEnabled)
**Impact on plan:** Necessary and expected consequence of the type change. The research file explicitly listed all nine `extensionEnabled` references that needed updating. Content script and popup updates are in scope as prerequisite fixes for compilation.

## Issues Encountered

None — content script and popup updates were expected from the research change map and completed cleanly.

## Next Phase Readiness

- `PlatformEnabled` type and `getSyncStorage()` migration are ready for consumers
- All content scripts read per-platform enabled state
- Popup uses `platformEnabled` (all-three bridge) — ready for per-platform redesign in plan 05-03
- Grayscale icon assets ready for service worker icon-switching logic in plan 05-02
- ADR 005 documented and accepted

---
*Phase: 05-per-site-enable-disable*
*Completed: 2026-04-03*
