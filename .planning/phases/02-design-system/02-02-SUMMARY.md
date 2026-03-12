---
phase: 02-design-system
plan: 02
subsystem: infra
tags: [tailwindcss, postcss, webpack, mini-css-extract-plugin, fontsource, tailwind-merge]

# Dependency graph
requires: []
provides:
  - Tailwind 4 PostCSS pipeline via @tailwindcss/postcss
  - MiniCssExtractPlugin extracting CSS to dist/ui/chat-styles.css
  - Font asset/resource rule for woff/woff2/eot/ttf/otf files (ui/fonts/)
  - tailwind-merge v3 for Tailwind 4 class semantics
  - @fontsource/inter and @fontsource/dm-mono installed and available
  - tailwind.config.js removed (CSS-first Tailwind 4 config)
affects: [02-03-styles, 02-04-components, 02-05-integration]

# Tech tracking
tech-stack:
  added:
    - tailwindcss@4.2.1 (upgraded from 3.x)
    - "@tailwindcss/postcss (replaces tailwindcss postcss plugin)"
    - mini-css-extract-plugin (new — extracts CSS to dist/ui/chat-styles.css)
    - "@fontsource/inter"
    - "@fontsource/dm-mono"
    - tailwind-merge@3.5.0 (upgraded from 2.x)
  patterns:
    - "CSS extracted to static file via MiniCssExtractPlugin (not injected via style-loader)"
    - "Font files emitted to ui/fonts/ via webpack asset/resource rule"
    - "Tailwind 4 CSS-first config — no tailwind.config.js, uses @import in CSS"

key-files:
  created: []
  modified:
    - webpack.config.js
    - postcss.config.js
    - package.json
    - package-lock.json

key-decisions:
  - "MiniCssExtractPlugin replaces style-loader — CSS extracted to dist/ui/chat-styles.css for link tag injection in iframe"
  - "autoprefixer removed — Tailwind 4 handles vendor prefixes natively (DS-08)"
  - "tailwind.config.js deleted — Tailwind 4 uses CSS-first @import 'tailwindcss' approach"
  - "tailwind-merge upgraded to v3 to match Tailwind 4 class name semantics"

patterns-established:
  - "CSS rule: [MiniCssExtractPlugin.loader, css-loader, postcss-loader] — established pattern for all CSS in the bundle"
  - "Font rule: asset/resource with filename ui/fonts/[name][ext] — all web fonts emitted to this path"

requirements-completed: [DS-01, DS-03, DS-08, DS-09]

# Metrics
duration: 2min
completed: 2026-03-12
---

# Phase 2 Plan 02: Build Tooling Migration Summary

**Tailwind 4 + MiniCssExtractPlugin wired into webpack — CSS will extract to dist/ui/chat-styles.css once styles.css is updated in plan 02-03**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-12T15:38:30Z
- **Completed:** 2026-03-12T15:40:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Upgraded tailwindcss from v3 to v4.2.1 and replaced the old PostCSS plugin with @tailwindcss/postcss
- Replaced style-loader with MiniCssExtractPlugin in the webpack CSS rule, adding plugin instance with filename `ui/chat-styles.css`
- Added font asset/resource webpack rule emitting woff/woff2/eot/ttf/otf to `ui/fonts/`
- Installed @fontsource/inter and @fontsource/dm-mono font packages
- Upgraded tailwind-merge from v2 to v3.5.0 for Tailwind 4 class semantics
- Removed autoprefixer (no longer needed with Tailwind 4)
- Deleted tailwind.config.js (CSS-first config used in Tailwind 4)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install / upgrade packages and delete tailwind.config.js** - `39e2331` (chore)
2. **Task 2: Update webpack.config.js and postcss.config.js** - `7e33fbf` (chore)

## Files Created/Modified

- `webpack.config.js` - Added MiniCssExtractPlugin require + CSS rule + font rule + plugin instance
- `postcss.config.js` - Replaced tailwindcss/autoprefixer plugins with @tailwindcss/postcss
- `package.json` - tailwindcss 4.x, tailwind-merge 3.x, mini-css-extract-plugin, fontsource packages; autoprefixer removed
- `package-lock.json` - Updated lockfile

## Decisions Made

- MiniCssExtractPlugin chosen to extract CSS into a linkable static file — required for iframe-based isolation where CSS must be loaded via `<link>` tag rather than injected `<style>` tags
- autoprefixer removed because Tailwind 4 generates vendor-prefixed output natively
- tailwind.config.js deleted — Tailwind 4 uses CSS-first configuration via `@import "tailwindcss"` in the CSS entry file

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all npm install/uninstall commands succeeded on first attempt. Webpack config parse check passed immediately. The one apparent "FAIL" in the autoprefixer verification check was a false positive: the word "autoprefixer" appears only in a comment line (`// autoprefixer REMOVED — Tailwind 4 handles vendor prefixes natively`), not as an active plugin.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Build tooling is fully wired for Tailwind 4
- `npm run build` will fail until plan 02-03 updates `src/content-scripts/styles.css` from `@tailwind base/components/utilities` to `@import "tailwindcss"` — this is expected and documented in the plan
- All subsequent plans (02-03, 02-04, 02-05) can proceed with this tooling in place

---
*Phase: 02-design-system*
*Completed: 2026-03-12*
