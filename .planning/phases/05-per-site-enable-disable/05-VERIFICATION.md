---
phase: 05-per-site-enable-disable
verified: 2026-04-03T14:30:00Z
status: human_needed
score: 6/6 must-haves verified
human_verification:
  - test: "Open popup on a Twitch tab, disable Twitch toggle — verify toolbar icon becomes grayscale"
    expected: "Icon in Chrome toolbar switches from color to grayscale immediately after toggle"
    why_human: "chrome.action.setIcon is called per-tab; no programmatic way to read back the rendered icon without a headless UI"
  - test: "Open popup on a Twitch stream page — verify the Twitch platform row has a highlighted left border"
    expected: "Platform row for Twitch shows a #9147ff left border and subtle background highlight"
    why_human: "current_platform is read from chrome.storage.session; requires a live extension context and visual inspection to confirm the CSS applies"
  - test: "Disable Twitch toggle in popup, navigate to a new Twitch tab — verify AllChat does NOT inject"
    expected: "#allchat-container is absent from page DOM"
    why_human: "E2E tests for this use mocked HTML fixtures; a live twitch.tv page confirms the guard works end-to-end in production DOM"
---

# Phase 5: Per-site Enable/Disable Verification Report

**Phase Goal:** The single global enable/disable toggle is replaced by three per-platform toggles (Twitch, YouTube, Kick) — users can independently control which platforms have AllChat active, with immediate effect via messaging (no page reload), grayscale toolbar icon for disabled platforms, and seamless migration from the legacy `extensionEnabled` boolean

**Verified:** 2026-04-03T14:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Popup shows three independent platform toggles (Twitch, YouTube, Kick) — no global toggle exists | VERIFIED | `popup.tsx` renders `{(['twitch', 'youtube', 'kick'] as const).map(...)}` with `.platform-row` + checkbox; no `isEnabled` state or `handleToggle` function present |
| 2 | Toggling a platform takes effect immediately without page reload — content scripts handle re-enable via `EXTENSION_STATE_CHANGED` message | VERIFIED | All four content scripts have `handleExtensionStateChange` with re-enable path (`new TwitchDetector()` / `new YouTubeDetector()` / `new KickDetector()` in `else` branch); no `chrome.tabs.reload` in `popup.tsx`; `handlePlatformToggle` sends `EXTENSION_STATE_CHANGED` to affected tabs only |
| 3 | Current tab's platform row is highlighted in the popup with a platform-colored left border | VERIFIED | `popup.tsx` line 169: `className={\`platform-row ${currentPlatform === p ? 'platform-row--active' : ''}\`} data-platform={p}`; `popup.html` CSS defines `.platform-row--active[data-platform="twitch"] { border-left-color: #9147ff }` (and equivalent for youtube/kick) |
| 4 | Toolbar icon shows grayscale for tabs where the platform is disabled, color for enabled | VERIFIED | `service-worker.ts` SET_CURRENT_PLATFORM handler reads `settings.platformEnabled[platform]` and calls `chrome.action.setIcon` with either color or gray path; `popup.tsx` `handlePlatformToggle` also calls `chrome.action.setIcon` on toggle |
| 5 | Existing users with `extensionEnabled` are seamlessly migrated to `platformEnabled` on first read | VERIFIED | `storage.ts` migration block: reads `extensionEnabled ?? true`, maps to all three platforms, persists `platformEnabled`, removes `extensionEnabled` key; `service-worker.ts` update handler calls `getSyncStorage()` to trigger migration on install |
| 6 | All three platforms default to enabled on fresh install | VERIFIED | `DEFAULT_SETTINGS.platformEnabled = { twitch: true, youtube: true, kick: true }` in `src/lib/types/extension.ts`; `onInstalled` writes `DEFAULT_SETTINGS` on fresh install |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/types/extension.ts` | `PlatformEnabled` type, updated `SyncStorage`, updated `DEFAULT_SETTINGS` | VERIFIED | Contains `export type PlatformEnabled`, `platformEnabled: PlatformEnabled` in `SyncStorage`, `DEFAULT_SETTINGS.platformEnabled = {twitch: true, youtube: true, kick: true}`; no `extensionEnabled` field |
| `src/lib/storage.ts` | Migration logic in `getSyncStorage` | VERIFIED | Contains `legacyEnabled`, `result.platformEnabled`, deep-merge, `delete (result as any).extensionEnabled`, `chrome.storage.sync.remove('extensionEnabled')` |
| `assets/icon-16-gray.png` | 16px grayscale icon | VERIFIED | File exists, valid PNG (confirmed by test runner) |
| `assets/icon-32-gray.png` | 32px grayscale icon | VERIFIED | File exists, valid PNG |
| `assets/icon-48-gray.png` | 48px grayscale icon | VERIFIED | File exists, valid PNG |
| `assets/icon-128-gray.png` | 128px grayscale icon | VERIFIED | File exists, valid PNG |
| `docs/adr/005-platform-enabled-storage-migration.md` | ADR for storage schema change | VERIFIED | Exists, `Status: Accepted`, documents `platformEnabled` and `extensionEnabled` migration |
| `src/content-scripts/twitch.ts` | Per-platform init check + re-enable path | VERIFIED | `settings.platformEnabled.twitch` on init; `handleExtensionStateChange` has `new TwitchDetector()` re-enable path; `messageRelaySetup` guard present |
| `src/content-scripts/youtube.ts` | Per-platform init check + re-enable path | VERIFIED | `settings.platformEnabled.youtube` on init; `handleExtensionStateChange` has `new YouTubeDetector()` re-enable path; `messageRelaySetup` guard present |
| `src/content-scripts/youtube-studio.ts` | Per-platform init check + re-enable path | VERIFIED | `settings.platformEnabled.youtube` on init (correct — uses youtube key); `handleExtensionStateChange` has `new YouTubeStudioDetector()` re-enable path; `messageRelaySetup` guard present |
| `src/content-scripts/kick.ts` | Per-platform init check + re-enable path | VERIFIED | `settings.platformEnabled.kick` on init; `handleExtensionStateChange` has `new KickDetector()` re-enable path; `messageRelaySetup` guard present |
| `src/popup/popup.tsx` | Three per-platform toggles with active row highlighting | VERIFIED | `platformEnabled` state, `handlePlatformToggle`, `EXTENSION_STATE_CHANGED` messaging, `platform-row--active`, `data-platform={p}`, `chrome.action.setIcon`; no `isEnabled`, `handleToggle`, or `chrome.tabs.reload` |
| `src/popup/popup.html` | CSS for `.platform-row` and `.platform-row--active` | VERIFIED | Contains `.platform-row`, `.platform-row--active`, `border-left-color: #9147ff`, `border-left-color: #FF4444`, `border-left-color: #53FC18` |
| `src/background/service-worker.ts` | Grayscale icon logic on SET_CURRENT_PLATFORM + onInstalled migration | VERIFIED | SET_CURRENT_PLATFORM handler reads `settings.platformEnabled`, calls `chrome.action.setIcon` with `icon-16-gray.png`/`icon-32-gray.png`; update handler calls `getSyncStorage()` for migration |
| `tests/test-per-site-enable.spec.ts` | E2E test suite for per-site enable/disable | VERIFIED | Contains `platformEnabled`, real assertions (no `test.skip`), `@phase5` tag, popup toggle tests, injection tests |
| `tests/test-storage-migration.spec.ts` | Storage migration test suite | VERIFIED | Contains `extensionEnabled`, `@phase5` tag, real assertions (no `test.skip`), ADR/asset checks, E2E migration tests |
| `README.md` | Updated documentation | VERIFIED | Contains "per-platform" string, mentions Twitch, YouTube, Kick as independently toggleable |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/popup/popup.tsx` | `chrome.tabs.sendMessage` | `handlePlatformToggle` sends `EXTENSION_STATE_CHANGED` | VERIFIED | Line 62-65: sends `{ type: 'EXTENSION_STATE_CHANGED', enabled: newState[platform] }` to tab |
| `src/background/service-worker.ts` | `chrome.action.setIcon` | `SET_CURRENT_PLATFORM` handler | VERIFIED | Line 184: `chrome.action.setIcon({ tabId: sender.tab.id, path: iconPath })` |
| `src/lib/storage.ts` | `src/lib/types/extension.ts` | import `SyncStorage, DEFAULT_SETTINGS` | VERIFIED | Line 5: `import { LocalStorage, SyncStorage, DEFAULT_SETTINGS } from './types/extension'` |
| `src/content-scripts/twitch.ts` | `src/lib/storage.ts` | `getSyncStorage()` returns `platformEnabled` | VERIFIED | Line 153: `if (!settings.platformEnabled.twitch)` |
| `src/content-scripts/twitch.ts` | `EXTENSION_STATE_CHANGED` message | `setupGlobalMessageRelay` listener | VERIFIED | Lines 221-224: listener handles `EXTENSION_STATE_CHANGED`, calls `handleExtensionStateChange` |
| `tests/test-per-site-enable.spec.ts` | `src/popup/popup.tsx` | Opens popup page and locates `.platform-row` | VERIFIED | Line 111: `popupPage.locator('.platform-row')`, expects count 3 |
| `tests/test-per-site-enable.spec.ts` | `chrome.storage.sync` | Sets `platformEnabled` via SW evaluate | VERIFIED | Line 125: `chrome.storage.sync.set({ platformEnabled: { twitch: false, ... } })` |
| `tests/test-storage-migration.spec.ts` | `src/lib/storage.ts` | Validates `getSyncStorage` migration via source inspection | VERIFIED | Lines 26-28: reads `storage.ts` source and checks for `result.platformEnabled` and `legacyEnabled` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/popup/popup.tsx` | `platformEnabled` | `getSyncStorage()` call in `useEffect` | Yes — reads from `chrome.storage.sync`, returns typed `SyncStorage` with `platformEnabled` object | FLOWING |
| `src/popup/popup.tsx` | `currentPlatform` | `chrome.storage.session.get(['current_platform'])` | Yes — content scripts write `current_platform` via `SET_CURRENT_PLATFORM` message | FLOWING |
| `src/content-scripts/twitch.ts` | `settings.platformEnabled.twitch` | `getSyncStorage()` | Yes — reads from `chrome.storage.sync`, migration-aware | FLOWING |
| `src/background/service-worker.ts` | `settings.platformEnabled[platform]` | `getSyncStorage()` in SET_CURRENT_PLATFORM handler | Yes — reads live storage on each tab activation | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles with new schema | `npm run build` | `webpack compiled with 2 warnings in 2033ms` (warnings are asset size, not errors) | PASS |
| `PlatformEnabled` type exported | `grep 'export type PlatformEnabled'` in `extension.ts` | Match found | PASS |
| No `extensionEnabled` in content scripts | `grep -r extensionEnabled src/content-scripts/` | No matches | PASS |
| No `extensionEnabled` in popup/background | `grep -r extensionEnabled src/popup/ src/background/` | No matches | PASS |
| No `chrome.tabs.reload` in popup | `grep -c chrome.tabs.reload popup.tsx` | 0 | PASS |
| No `test.skip` in per-site-enable spec | `grep -c test.skip test-per-site-enable.spec.ts` | 0 | PASS |
| No `test.skip` in storage-migration spec | `grep -c test.skip test-storage-migration.spec.ts` | 0 | PASS |
| Static/fs-based tests pass | `npx playwright test --grep-invert E2E` (both spec files) | 16/16 passed | PASS |

---

### Requirements Coverage

The D-series requirements are defined in `05-CONTEXT.md` and `05-RESEARCH.md` (not in top-level `REQUIREMENTS.md` — these are phase-internal decisions, not v1 requirements). The top-level `REQUIREMENTS.md` has no D-series entries and contains no Phase 5 traceability rows. This is a documentation gap but not a functional gap — the requirements are met.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| D-01 | 05-01, 05-00 | Per-platform granularity (Twitch, YouTube, Kick booleans) | SATISFIED | `PlatformEnabled` type with three booleans; `SyncStorage.platformEnabled` |
| D-02 | 05-01, 05-00 | Remove `extensionEnabled`, replace with `platformEnabled` | SATISFIED | Zero `extensionEnabled` references in `src/content-scripts/`, `src/popup/`, `src/background/`; migration in `getSyncStorage()` |
| D-03 | 05-03 | Three per-platform toggles in popup | SATISFIED | `popup.tsx` renders three `.platform-row` elements with checkboxes |
| D-04 | 05-02, 05-03 | Immediate effect via `EXTENSION_STATE_CHANGED`, no tab reload | SATISFIED | `handleExtensionStateChange` has re-enable path in all four scripts; no `chrome.tabs.reload` in popup |
| D-05 | 05-03 | Highlight current tab's platform row | SATISFIED | `currentPlatform === p ? 'platform-row--active' : ''` with platform-colored border in CSS |
| D-06 | 05-01 | All three platforms enabled by default | SATISFIED | `DEFAULT_SETTINGS.platformEnabled = { twitch: true, youtube: true, kick: true }` |
| D-07 | 05-01, 05-03 | Grayscale icon when platform disabled | SATISFIED | Pre-generated gray PNGs; `chrome.action.setIcon` called in popup toggle and service worker |
| D-08 | 05-01 | No "OFF" badge — grayscale icon is sufficient | SATISFIED | No `setBadgeText` call added for disabled state; badge logic unchanged (only on WS connect/disconnect) |

**Orphaned D-requirements:** None. All eight D-requirements claimed by plans are verifiably implemented.

**REQUIREMENTS.md gap (documentation):** The top-level `REQUIREMENTS.md` traceability table does not have Phase 5 entries (no D-series rows). This is a documentation gap — REQUIREMENTS.md was not updated to add the D-series requirements or their Phase 5 traceability entries. The feature is implemented correctly but REQUIREMENTS.md does not reflect it.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/storage.ts` | 1-140 | `extensionEnabled` appears 6 times | INFO | All occurrences are in the migration code (`& { extensionEnabled?: boolean }` type, `result.extensionEnabled`, `delete (result as any).extensionEnabled`, comment, `items.extensionEnabled`, `chrome.storage.sync.remove('extensionEnabled')`). These are intentional — the migration code must reference the legacy key name to detect and remove it. Not a stub. |
| None | — | — | — | No placeholder returns, no `TODO`/`FIXME` markers, no `chrome.tabs.reload` in popup found |

No blockers or warnings found.

---

### Human Verification Required

#### 1. Grayscale Toolbar Icon

**Test:** Install the extension, navigate to a Twitch stream page, open the popup, disable the Twitch toggle, then close the popup. Observe the browser toolbar icon for the active tab.
**Expected:** The AllChat toolbar icon switches from color to grayscale immediately. Re-enabling the Twitch toggle restores the color icon.
**Why human:** `chrome.action.setIcon` changes the rendered toolbar icon. There is no programmatic API to read back the currently rendered icon path to assert grayscale vs. color.

#### 2. Active Row Highlight Visual

**Test:** Open the extension popup while on a Twitch.tv stream page. Observe the platform toggle list.
**Expected:** The Twitch row has a purple (#9147ff) left border and a subtle background highlight. YouTube and Kick rows have no border or highlight.
**Why human:** The `current_platform` session storage value is set by the content script after `chrome.runtime.sendMessage({ type: 'SET_CURRENT_PLATFORM' })`. Verifying the session key is populated and the CSS renders correctly requires a live extension instance and visual inspection.

#### 3. Cross-Platform Independence (live pages)

**Test:** Disable Twitch in the popup. Navigate to a live YouTube stream and confirm AllChat still injects. Navigate to a Twitch stream and confirm AllChat does NOT inject.
**Expected:** YouTube injection unaffected; Twitch injection suppressed.
**Why human:** The E2E test for this uses mocked HTML fixtures (`youtube-mock.html`, `twitch-mock.html`). A live browser test confirms the guard works against production DOM structures that may differ from fixtures.

---

### Gaps Summary

No functional gaps were found. All six observable truths are satisfied. All 17 required artifacts exist, are substantive, and are wired. All eight D-requirements are implemented.

The three items flagged for human verification are behavioral UX checks (visual icon feedback, CSS rendering, live page behavior) that cannot be confirmed through static analysis or fixture-based tests alone.

One documentation gap exists: `REQUIREMENTS.md` does not contain Phase 5 D-series requirement entries or traceability rows. This does not affect runtime behavior but leaves the project requirements document incomplete.

---

_Verified: 2026-04-03T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
