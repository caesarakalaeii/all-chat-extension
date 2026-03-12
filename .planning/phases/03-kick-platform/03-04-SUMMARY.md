---
phase: 03-kick-platform
plan: "04"
subsystem: infra
tags: [manifest, webpack, content-scripts, chrome-extension, kick]

# Dependency graph
requires:
  - phase: 03-kick-platform 03-03
    provides: src/content-scripts/kick.ts (Kick content script implementation)
provides:
  - manifest.json with Kick host_permissions, content_scripts, and web_accessible_resources entries
  - webpack.config.js with content-scripts/kick entry pointing to kick.ts
  - dist/content-scripts/kick.js built bundle (produced by npm run build)

affects: [any phase that modifies manifest.json or webpack.config.js]

# Tech tracking
tech-stack:
  added: []
  patterns: [manifest content_scripts entry mirrors webpack entry key; host_permissions, content_scripts.matches, and web_accessible_resources.matches all use https://kick.com/* format]

key-files:
  created: []
  modified:
    - manifest.json
    - webpack.config.js

key-decisions:
  - "Kick manifest entries use https://kick.com/* (no www subdomain) — consistent across host_permissions, content_scripts.matches, and web_accessible_resources.matches"

patterns-established:
  - "New platform content script requires exactly 4 manifest locations: host_permissions, content_scripts entry, web_accessible_resources.matches, plus one webpack entry"

requirements-completed: [KICK-03, KICK-04]

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 03 Plan 04: Kick Manifest and Webpack Wiring Summary

**manifest.json and webpack.config.js updated with Kick entries, producing dist/content-scripts/kick.js on build with all 6 Playwright tests passing**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-12T17:28:00Z
- **Completed:** 2026-03-12T17:33:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `https://kick.com/*` to `host_permissions` in manifest.json
- Added Kick `content_scripts` entry (matches, js, css, run_at) after YouTube entry in manifest.json
- Added `https://kick.com/*` to `web_accessible_resources[0].matches` in manifest.json
- Added `content-scripts/kick` webpack entry pointing to `src/content-scripts/kick.ts`
- `npm run build` exits 0, producing `dist/content-scripts/kick.js`
- Full Playwright suite: 6 passed, 32 skipped (Kick stubs skip as expected), zero failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Update manifest.json and webpack.config.js with Kick entries** - `fffec9a` (feat)
2. **Task 2: Build and verify dist/content-scripts/kick.js is produced** - `6604f80` (chore)

## Files Created/Modified

- `manifest.json` - Added Kick to host_permissions, content_scripts array, and web_accessible_resources.matches
- `webpack.config.js` - Added `content-scripts/kick` entry between youtube and ui/chat-bundle entries

## Decisions Made

- Kick manifest entries use `https://kick.com/*` (no www subdomain) — consistent across all three manifest locations and matching the Kick platform's URL structure

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - build succeeded on first attempt, all manifest JSON valid, all tests pass.

## User Setup Required

Manual KICK-03 verification still required (cannot be automated):
1. Load extension unpacked from dist/ in Chrome
2. Navigate to a live kick.com stream
3. Confirm AllChat iframe replaces native Kick chat
4. Navigate to a second live stream (SPA navigation test)
5. Confirm iframe reinjects in new stream's chat slot

## Next Phase Readiness

- Phase 3 is complete: kick.ts implemented (03-03), manifest and webpack wired (03-04)
- Manual KICK-03 browser verification required before /gsd:verify-work
- Phase 4 (agent tests) can proceed after KICK-03 manual sign-off

---
*Phase: 03-kick-platform*
*Completed: 2026-03-12*

## Self-Check: PASSED

- manifest.json: FOUND
- webpack.config.js: FOUND
- dist/content-scripts/kick.js: FOUND
- Commit fffec9a: FOUND
- Commit 6604f80: FOUND
