---
phase: 06-add-pop-out-button-for-standalone-chat-overlay
plan: "02"
subsystem: ui
tags: [chat-ui, pop-out, chrome-runtime-port, header-buttons]
dependency_graph:
  requires:
    - src/lib/types/popout.ts (from Plan 01)
  provides:
    - Pop-out button in AllChat header
    - "Switch to native" button in AllChat header
    - "Chat popped out" banner when pop-out window is active
    - Dual-mode communication: postMessage for in-page, chrome.runtime.Port for pop-out
  affects:
    - src/ui/components/ChatContainer.tsx
tech_stack:
  added: []
  patterns:
    - Dual-mode communication helper (sendToContentScript)
    - chrome.runtime.Port with disconnect/reconnect in pop-out mode
    - URL param pop-out detection (?popout=1)
    - chrome.storage.local message buffer loading in pop-out mode
key_files:
  created: []
  modified:
    - src/ui/components/ChatContainer.tsx
decisions:
  - "All window.parent.postMessage calls replaced by sendToContentScript() helper — enables pop-out mode to use chrome.runtime.sendMessage without duplicating call sites"
  - "handleIncomingMessage() extracted from inline event handler — shared between postMessage and chrome.runtime.Port listeners"
  - "Pop-out buffer loaded in loadAuth() effect (mount) — ensures messages display before connection is established"
  - "Collapse button hidden in pop-out mode (isPopOut) — standalone window has OS-level close button; collapse concept doesn't apply"
  - "POPOUT_OPENED/CLOSED messages handled in handleIncomingMessage — isPoppedOut state drives banner display and pop-out button visibility"
metrics:
  duration: "7 minutes"
  completed: "2026-04-07T09:33:00Z"
  tasks_completed: 2
  files_changed: 1
---

# Phase 6 Plan 02: ChatContainer Pop-Out UI and Dual-Mode Communication Summary

**One-liner:** Pop-out button, "Switch to native" button, and "Chat popped out" banner added to ChatContainer with chrome.runtime.Port for pop-out window and postMessage relay for in-page mode.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add pop-out mode detection and chrome.runtime.Port communication | 21845b9 | src/ui/components/ChatContainer.tsx |
| 2 | Add header buttons, "Chat popped out" banner, and pop-out request | 21845b9 | src/ui/components/ChatContainer.tsx |

Note: Both tasks modify the same file and were committed atomically in one commit.

## What Was Built

**`src/ui/components/ChatContainer.tsx`** — Modified with:

### Communication Layer (Task 1)

- **Pop-out detection:** `const isPopOut = urlParams.get('popout') === '1'` at top of component — reads URL param set by content script when opening pop-out window
- **`isPoppedOut` state:** `useState(false)` tracks whether the pop-out window is currently open (drives banner display)
- **`sendToContentScript()` helper:** Mode-aware dispatch — `chrome.runtime.sendMessage` in pop-out mode, `window.parent.postMessage` in in-page mode
- **`handleIncomingMessage()` extractor:** Shared message handler called by both postMessage and Port listeners. Handles CONNECTION_STATE, WS_MESSAGE, POPOUT_OPENED, POPOUT_CLOSED
- **Dual-mode useEffect:** `chrome.runtime.connect({ name: POPOUT_PORT_NAME })` in pop-out mode with port disconnect/reconnect after 1s; `window.addEventListener('message', ...)` in in-page mode
- **Message buffer loading:** In pop-out mode, `chrome.storage.local.get(POPOUT_MESSAGE_BUFFER_KEY)` on mount pre-populates message history, then removes the buffer key (D-08, T-06-03)

### UI Layer (Task 2)

- **"Switch to native" button:** Left-arrow SVG + "Native" label, `aria-label="Switch to native chat"`, sends `SWITCH_TO_NATIVE` via `sendToContentScript`
- **Pop-out button:** External-link SVG, `aria-label="Open chat in new window"`, `title="Open in new window"`, sends `POPOUT_REQUEST` with `messages.slice(-POPOUT_MAX_MESSAGES)` (caps at 50, per T-06-03 threat mitigation)
- **Pop-out button visibility:** Hidden when `isPoppedOut` is true (D-05 — chat already popped out)
- **Collapse button visibility:** Hidden when `isPopOut` is true (standalone window doesn't need collapse)
- **"Chat popped out" banner:** Replaces normal chat content when `isPoppedOut` is true — shows InfinityLogo (32px), heading "Chat is open in a separate window", body "Your chat is running in the pop-out window.", "Bring back chat" button that sends `CLOSE_POPOUT`

## Verification

- `npx tsc --noEmit` — exits 0, zero errors

## Deviations from Plan

None — plan executed exactly as written. Both tasks were implemented in a single file write and committed atomically in one commit (both tasks target the same file and were naturally combined).

## Known Stubs

None — all implemented functionality is wired and functional. The pop-out flow requires Plan 03 (content script handler for POPOUT_REQUEST) to fully work end-to-end, but this plan's deliverables are complete.

## Threat Flags

None — no new network endpoints or auth paths introduced. All messages follow existing patterns:
- `POPOUT_REQUEST` follows existing extensionOrigin-checked postMessage path (T-06-02: accepted per plan)
- Message buffer capped at POPOUT_MAX_MESSAGES=50 (T-06-03: mitigated)
- Pop-out button only rendered once per iframe; content script prevents duplicate pop-out windows (T-06-04: content script responsibility, Plan 03)

## Self-Check: PASSED

Files modified:
- src/ui/components/ChatContainer.tsx — contains `const isPopOut`, `isPoppedOut`, `sendToContentScript`, `handlePopOut`, `POPOUT_PORT_NAME` — FOUND

Commits:
- 21845b9 — FOUND
