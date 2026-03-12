---
phase: 03-kick-platform
plan: 02
subsystem: security
tags: [postMessage, chrome-extension, content-scripts, XSS, origin-validation]

# Dependency graph
requires:
  - phase: 03-kick-platform
    plan: 01
    provides: kick-platform scaffold, test infrastructure patterns

provides:
  - postMessage targetOrigin hardened to extensionOrigin in all content scripts
  - Origin guard in iframe listener rejecting non-extension messages
  - KICK-05 fs-check tests (KICK-05a/b/c/d) passing

affects:
  - kick.ts (when written in 03-03) must use extensionOrigin for postMessage relay
  - Any future content script must use chrome.runtime.getURL('').slice(0,-1) for postMessage

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "extensionOrigin derivation: chrome.runtime.getURL('').slice(0, -1) at each postMessage call site"
    - "origin guard pattern: const extensionOrigin = ...; if (event.origin !== extensionOrigin) return;"

key-files:
  created: []
  modified:
    - src/content-scripts/base/PlatformDetector.ts
    - src/content-scripts/twitch.ts
    - src/content-scripts/youtube.ts
    - src/ui/index.tsx
    - tests/test-postmessage-origin.spec.ts

key-decisions:
  - "extensionOrigin derived at call site (not module-level) — getURL is synchronous so this is fine and avoids top-level init ordering issues"
  - "Origin guard placed as FIRST lines inside message listener — guard before any event.data access"

patterns-established:
  - "postMessage security pattern: always use extensionOrigin (chrome.runtime.getURL('').slice(0,-1)) as targetOrigin in content scripts"
  - "iframe listener pattern: guard with event.origin !== extensionOrigin before processing any message type"

requirements-completed: [KICK-05]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 3 Plan 2: postMessage Origin Hardening (KICK-05) Summary

**All postMessage wildcard targetOrigins replaced with chrome.runtime.getURL origin, plus iframe listener rejection guard — closing third-party iframe XSS vector across Twitch, YouTube, and the shared UI layer**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-12T17:02:45Z
- **Completed:** 2026-03-12T17:06:05Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Replaced all `'*'` postMessage targetOrigins with `extensionOrigin` in PlatformDetector.ts (ALLCHAT_INIT), twitch.ts (relay + GET_CONNECTION_STATE response), and youtube.ts (relay + GET_CONNECTION_STATE response)
- Added origin guard to `src/ui/index.tsx` iframe message listener — rejects any message where `event.origin !== extensionOrigin` before ALLCHAT_INIT processing
- Implemented KICK-05a/b/c/d as real fs-check tests (previously all static `test.skip()` stubs) — all 4 pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace '*' targetOrigin in all content script postMessage send sites** - `909bb95` (feat)
2. **Task 2: Add origin guard to iframe message listener in src/ui/index.tsx** - `9ab18d1` (feat)

**Plan metadata:** (docs commit — see final commit in this session)

_Note: TDD tasks had RED/GREEN cycle — tests written first (failing), then source changes made them pass_

## Files Created/Modified

- `src/content-scripts/base/PlatformDetector.ts` - ALLCHAT_INIT postMessage now uses extensionOrigin
- `src/content-scripts/twitch.ts` - Relay and GET_CONNECTION_STATE response use extensionOrigin
- `src/content-scripts/youtube.ts` - Relay and GET_CONNECTION_STATE response use extensionOrigin
- `src/ui/index.tsx` - Origin guard before ALLCHAT_INIT processing
- `tests/test-postmessage-origin.spec.ts` - KICK-05a/b/c/d implemented as real fs-check tests

## Decisions Made

- extensionOrigin derived at each call site (not module-level): `chrome.runtime.getURL('').slice(0, -1)` — synchronous call, always correct, avoids top-level init ordering issues
- Origin guard placed as first two lines inside message listener — guard fires before any `event.data` access, not just before ALLCHAT_INIT type check

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `test-container-cleanup.spec.ts` was already failing before this plan's changes (pre-existing, out of scope per deviation rules). Verified by stashing changes and confirming the test still failed on the prior commit.

## Next Phase Readiness

- Security hardening complete for Twitch and YouTube postMessage channels
- kick.ts (plan 03-03) must follow the same extensionOrigin pattern when its relay is implemented
- No blockers for next plan

---
*Phase: 03-kick-platform*
*Completed: 2026-03-12*
