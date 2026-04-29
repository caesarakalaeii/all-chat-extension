---
phase: 07-twitch-native-widget-extraction
plan: "03"
subsystem: ui
tags: [chat-container, tab-bar-mode, header, pop-out]
dependency_graph:
  requires: []
  provides: [tabBarMode-aware-ChatContainer]
  affects: [src/ui/components/ChatContainer.tsx]
tech_stack:
  added: []
  patterns: [postMessage-driven-state, conditional-header-rendering, absolute-positioning-floating-button]
key_files:
  modified:
    - src/ui/components/ChatContainer.tsx
decisions:
  - "tabBarMode state defaults to false — non-Twitch platforms unaffected without any content script message"
  - "TAB_BAR_MODE message handled before CONNECTION_STATE in handleIncomingMessage — ensures fast header toggle"
  - "Floating pop-out button guarded by !isPoppedOut && !isPopOut — not shown when already in pop-out window"
  - "position: relative added via Tailwind class (relative) on outer div — consistent with existing class-based styling"
metrics:
  duration: "1 minute"
  completed: "2026-04-12"
  tasks_completed: 1
  files_modified: 1
---

# Phase 7 Plan 03: tabBarMode-aware ChatContainer Summary

ChatContainer now hides its header when the Twitch tab bar takes control, with the pop-out button repositioning to a floating top-right icon.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add tabBarMode state and conditional header rendering | 970da84 | src/ui/components/ChatContainer.tsx |

## What Was Built

`ChatContainer.tsx` gained three coordinated changes:

1. **tabBarMode state** (`useState(false)`) — defaults false so YouTube/Kick/pop-out are unaffected with no content script message needed.

2. **TAB_BAR_MODE postMessage handler** — added at the top of `handleIncomingMessage` (before `CONNECTION_STATE`) to toggle `tabBarMode` when the Twitch content script sends `{ type: 'TAB_BAR_MODE', enabled: true/false }`.

3. **Conditional header + floating pop-out button**:
   - The full header div (collapse button, InfinityLogo, connection dot, platform badge, switch-to-native button, pop-out button) is wrapped in `{!tabBarMode && (...)}`.
   - When `tabBarMode` is true, a floating `<div style={{ position: 'absolute', top: 4, right: 4, zIndex: 10 }}>` renders only the pop-out button — accessible from the iframe even when the tab bar has replaced the header.
   - The outer container div gains the `relative` Tailwind class to serve as positioning context for the floating button.

## Verification

- `npm run build` exits 0 (webpack compiled successfully in ~2284ms)
- All acceptance criteria patterns confirmed present in source:
  - `const [tabBarMode, setTabBarMode] = useState(false)` — line 132
  - `data.type === 'TAB_BAR_MODE'` — line 226
  - `setTabBarMode(data.enabled` — line 227
  - `{!tabBarMode &&` — line 509
  - `{tabBarMode &&` — line 582
  - `relative` class on outer div — line 507

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the implementation is complete. `tabBarMode` starts as `false` (correct default), no placeholder values.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The TAB_BAR_MODE message source check (`event.source !== window.parent`) already guards the message handler (T-07-04 disposition: accept, existing guard confirmed present at line 339).

## Self-Check

- [x] `src/ui/components/ChatContainer.tsx` exists and contains all required patterns
- [x] Commit `970da84` exists in git log
- [x] Build passes (webpack exit 0)

## Self-Check: PASSED
