---
phase: 06-add-pop-out-button-for-standalone-chat-overlay
plan: "03"
subsystem: service-worker, content-scripts
tags: [pop-out, port-management, platform-detector, websocket-broadcast]
dependency_graph:
  requires: ["06-01"]
  provides: ["06-04", "06-05"]
  affects: ["src/background/service-worker.ts", "src/content-scripts/base/PlatformDetector.ts"]
tech_stack:
  added: []
  patterns:
    - chrome.runtime.Port long-lived connections for pop-out window messaging
    - setInterval polling for pop-out window close detection
    - chrome.storage.local for pop-out window dimension persistence
key_files:
  created: []
  modified:
    - src/background/service-worker.ts
    - src/content-scripts/base/PlatformDetector.ts
decisions:
  - "Pop-out dimensions saved every 2s via polling counter (4 polls * 500ms) rather than beforeunload — beforeunload is unreliable for programmatic close detection"
  - "startPopoutPolling is private; iframe reference captured at call site in handlePopoutRequest to avoid stale DOM queries inside interval"
  - "injectSwitchToAllChatButton uses fixed positioning bottom-right — content scripts can override for platform-specific DOM targets"
  - "Screen bounds clamping applied to persisted x/y to handle display configuration changes between sessions"
metrics:
  duration: "10min"
  completed: "2026-04-07T09:31:13Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 06 Plan 03: Port Management and Pop-Out Lifecycle Summary

Port-based broadcast for pop-out windows in service worker plus full pop-out lifecycle (open, poll close, save dimensions, switch native/AllChat) in PlatformDetector base class.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add chrome.runtime.Port management to service worker | 9d06874 | src/background/service-worker.ts |
| 2 | Add pop-out lifecycle methods to PlatformDetector base class | 6901a50 | src/content-scripts/base/PlatformDetector.ts |

## What Was Built

### Task 1 — Service Worker Port Registry

Added a `popoutPorts: Set<chrome.runtime.Port>` registry at module level. The `chrome.runtime.onConnect` listener accepts connections named `allchat-popout` (the `POPOUT_PORT_NAME` constant from `lib/types/popout`) and auto-removes ports on disconnect. A `broadcastToPorts()` helper sends to all registered ports with error cleanup on stale ports. Both `broadcastConnectionState` and `handleWebSocketMessage` now call `broadcastToPorts` in addition to the existing tab-based broadcast.

### Task 2 — PlatformDetector Pop-Out Lifecycle

Added three instance properties: `popoutWindow`, `popoutPollInterval`, and `allchatHidden`. The new public methods are:

- `handlePopoutRequest(data)` — Writes message buffer to `chrome.storage.local`, reads persisted window dimensions (with screen-bounds clamping), opens the pop-out window via `window.open`, notifies the in-page iframe (`POPOUT_OPENED`), and starts dimension polling.
- `closePopout()` — Saves final dimensions and closes the pop-out window programmatically.
- `handleSwitchToNative()` — Hides the `#allchat-container` div, calls `showNativeChat()`, and injects the "Switch to AllChat" button.
- `handleSwitchToAllChat()` — Restores the `#allchat-container`, calls `hideNativeChat()`, and removes the switch button.

Protected helpers `injectSwitchToAllChatButton()` and `removeSwitchToAllChatButton()` are overridable by platform-specific subclasses for DOM targeting. The `teardown()` method now clears the poll interval and removes the switch button before the existing container/style cleanup.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all methods are fully implemented. The switch button uses a fixed-position bottom-right placement as the default; platform subclasses can override `injectSwitchToAllChatButton` for platform-specific targets (this is intentional design, not a stub).

## Threat Flags

No new security-relevant surfaces introduced beyond those documented in the plan's threat model (T-06-05 through T-06-08).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| service-worker.ts exists | FOUND |
| PlatformDetector.ts exists | FOUND |
| 06-03-SUMMARY.md exists | FOUND |
| Commit 9d06874 exists | FOUND |
| Commit 6901a50 exists | FOUND |
| POPOUT_PORT_NAME import | PASS |
| popoutPorts Set | PASS |
| onConnect listener | PASS |
| port name guard | PASS |
| broadcastToPorts called | PASS |
| handlePopoutRequest | PASS |
| closePopout | PASS |
| handleSwitchToNative | PASS |
| handleSwitchToAllChat | PASS |
| popoutWindow property | PASS |
| allchatHidden property | PASS |
| allchat-switch-btn | PASS |
| popout import | PASS |
| teardown clears popoutPollInterval | PASS |
| tsc --noEmit | PASS |
