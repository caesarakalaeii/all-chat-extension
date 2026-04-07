---
phase: 06-add-pop-out-button-for-standalone-chat-overlay
plan: "01"
subsystem: types
tags: [types, pop-out, storage, test-stubs]
dependency_graph:
  requires: []
  provides:
    - src/lib/types/popout.ts
    - extended LocalStorage interface with pop-out keys
    - Wave 0 test stubs for POP-01 through POP-07
  affects:
    - src/lib/types/extension.ts
tech_stack:
  added: []
  patterns:
    - PopoutMessage discriminated union type
    - test.skip at individual test level (Phase 5 convention)
key_files:
  created:
    - src/lib/types/popout.ts
    - tests/test-popout-button.spec.ts
    - tests/test-switch-native.spec.ts
  modified:
    - src/lib/types/extension.ts
decisions:
  - "Import ChatMessage from ./message in popout.ts — message history transfer requires full ChatMessage type for the POPOUT_MAX_MESSAGES buffer"
  - "PopoutMessage union uses discriminated type field — consistent with existing ExtensionMessage union pattern in extension.ts"
  - "POPOUT_DEFAULTS set to 420x700 per UI-SPEC; x/y at 100,100 matching OAuth window.open() pattern in content scripts"
metrics:
  duration: "10 minutes"
  completed: "2026-04-07T09:26:15Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 6 Plan 01: Type Contracts and Wave 0 Test Scaffolds Summary

**One-liner:** Pop-out type contracts (PopoutMessage union, POPOUT_DEFAULTS, storage keys) and Wave 0 Playwright skip-stubs for all 7 POP requirements.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Define pop-out types and extend LocalStorage | 4ac172a | src/lib/types/popout.ts (new), src/lib/types/extension.ts |
| 2 | Create Wave 0 test stubs for pop-out and native switch | aac2e9d | tests/test-popout-button.spec.ts (new), tests/test-switch-native.spec.ts (new) |

## What Was Built

**`src/lib/types/popout.ts`** — New type file exporting:
- `PopoutRequestMessage`, `PopoutOpenedMessage`, `PopoutClosedMessage`, `SwitchToNativeMessage`, `ClosePopoutMessage`, `SwitchToAllChatMessage` — individual postMessage interfaces
- `PopoutMessage` — discriminated union of all six interfaces
- `POPOUT_DEFAULTS` — `{ width: 420, height: 700, x: 100, y: 100 }` per UI-SPEC
- `POPOUT_MESSAGE_BUFFER_KEY` — storage key constant
- `POPOUT_MAX_MESSAGES` — `50` (caps message buffer, mitigates T-06-01 DoS)
- `POPOUT_CLOSE_POLL_MS` — `500` (pop-out close detection poll interval)
- `POPOUT_PORT_NAME` — `'allchat-popout'`

**`src/lib/types/extension.ts`** — `LocalStorage` interface extended with 5 new optional keys:
- `popout_window_width?: number` (D-07)
- `popout_window_height?: number` (D-07)
- `popout_window_x?: number` (D-07)
- `popout_window_y?: number` (D-07)
- `popout_message_buffer?: string` (D-08)

**Test scaffolds** — 7 individual `test.skip` stubs:
- `tests/test-popout-button.spec.ts`: POP-01 through POP-05
- `tests/test-switch-native.spec.ts`: POP-06 and POP-07

## Verification

- `npx tsc --noEmit` — exits 0, no type errors
- `npx playwright test tests/test-popout-button.spec.ts tests/test-switch-native.spec.ts` — 7 skipped, 0 failed

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

The test stubs in `test-popout-button.spec.ts` and `test-switch-native.spec.ts` are intentional Wave 0 scaffolds. They will be filled in by plans 06-02 (POP-01..POP-05) and 06-03 (POP-06..POP-07) respectively. No plan goals are blocked by these stubs — they exist to pre-register test slots.

## Threat Flags

None — this plan creates only type definitions and test stubs with no runtime code or network surface.

## Self-Check: PASSED

Files created:
- src/lib/types/popout.ts — FOUND
- tests/test-popout-button.spec.ts — FOUND
- tests/test-switch-native.spec.ts — FOUND

Files modified:
- src/lib/types/extension.ts — contains `popout_window_width` — FOUND

Commits:
- 4ac172a — FOUND
- aac2e9d — FOUND
