# Phase 2: Design System - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace Tailwind 3 with Tailwind 4 (OkLCh design tokens scoped to iframe `:root`), apply Inter + DM Mono fonts (self-hosted, iframe-only), integrate InfinityLogo into a redesigned chat header, update all ChatContainer components to use semantic design tokens, and add an ErrorBoundary wrapping ChatContainer. No new platforms, no WebSocket changes — design system and UI quality only.

</domain>

<decisions>
## Implementation Decisions

### Font loading strategy
- Bundle fonts via `@fontsource/inter` and `@fontsource/dm-mono` (npm packages, self-hosted, offline-capable)
- Inter: weights 400 + 600 only (covers all current usage — body text + semibold usernames)
- DM Mono: weight 400 only (monospace body text in chat, no bold variant needed)
- Fonts scoped to iframe only — `@font-face` declarations live in `chat-styles.css`, loaded via `<link>` in `chat-container.html`. Platform pages never see these fonts.

### ChatContainer token depth
- Full rewrite: replace all `bg-gray-*`, `text-gray-*`, `border-gray-*` Tailwind 3 classes in ChatContainer, MessageInput, Toast, LoginPrompt, and Autocomplete with semantic token-based classes
- Use semantic class names from the new `@theme` block (`bg-surface`, `text-sub`, `border-border`, etc.)
- Scrollbar hardcoded hex values (`#18181b`, `#3a3a3d`) updated to token references: track → `var(--color-neutral-900)`, thumb → `var(--color-neutral-700)`, hover → `var(--color-neutral-600)`
- Platform accent colors updated to WCAG-AA values (`#A37BFF`, `#FF4444`, `#53FC18`) via existing `.platform-twitch/.platform-youtube/.platform-kick` CSS class pattern (left border accent)

### Header visual scope
- Full header redesign with InfinityLogo centered
- Layout: `[collapse button (left)] [InfinityLogo 24px (center)] [connection dot + platform badge (right)]`
- InfinityLogo size: 24px — same as AppNav in the main all-chat frontend
- Connection status: visual only — colored dot (green/yellow/red), no text labels
- Platform badge: small accent-colored indicator using `var(--color-twitch/youtube/kick)`
- Collapse button kept, restyled to match the new design system (token colors, proper sizing)
- No text label "All-Chat" — logo is the identity

### ErrorBoundary
- Class component `ErrorBoundary` wraps `ChatContainer` in `src/ui/index.tsx`
- Fallback: centered styled card using new design tokens — error icon, short message ("Chat failed to load"), and a "Try again" button
- Retry action: `this.setState({ hasError: false })` — resets boundary and remounts children (no page reload)
- No error details shown to user — error logged to `console.error` only, UI stays clean
- `ErrorDisplay.tsx` already exists in `src/ui/components/` — check if it can be reused or extended for the fallback card

### Claude's Discretion
- Exact semantic utility class names for the new token system (could be `bg-surface`, `bg-[var(--color-surface)]`, or `text-surface` depending on how Tailwind 4 @theme utilities are named)
- Whether to create a separate `ChatHeader.tsx` component or keep the header inline in `ChatContainer.tsx`
- `MiniCssExtractPlugin` configuration details (filename, chunk naming)
- How to handle `'use client'` directive in `InfinityLogo.tsx` — must be stripped for non-Next.js usage

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ui/components/ErrorDisplay.tsx`: existing error display component — check for reuse as ErrorBoundary fallback card
- `InfinityLogo.tsx` (`../all-chat/frontend/src/components/InfinityLogo.tsx`): copy into `src/ui/components/` — strip `'use client'` directive, keep animation logic intact (`useEffect` + `requestAnimationFrame`)
- `all-chat/frontend/src/app/globals.css`: source of truth for all `@theme` token definitions (colors, typography, spacing, radii) — copy the `@theme` block into the extension's `styles.css`

### Established Patterns
- `style-loader` currently inlines CSS into JS bundle — must be replaced with `MiniCssExtractPlugin` for the chat-bundle entry (produces separate `chat-styles.css` per DS-03)
- `webpack.config.js` uses `inject: false` for `chat-container.html` — CSS `<link>` tag must be added manually to the template
- `tailwind.config.js` exists and must be deleted (DS-01) — Tailwind 4 config lives in `styles.css` as `@import "tailwindcss"` + `@theme {}` block
- `postcss.config.js` has `autoprefixer` — must remove (DS-08); replace `tailwindcss: {}` with `@tailwindcss/postcss`
- `tailwind-merge` is at `^2.2.0` — upgrade to `^3.0.0` (DS-09)

### Integration Points
- `src/ui/styles.css`: replace `@tailwind base/components/utilities` with `@import "tailwindcss"` + full `@theme {}` block from globals.css
- `webpack.config.js` CSS rule: replace `style-loader` with `MiniCssExtractPlugin.loader` for the iframe bundle entry
- `src/ui/chat-container.html`: add `<link rel="stylesheet" href="chat-styles.css">` (after MiniCssExtractPlugin produces it)
- `src/ui/index.tsx`: wrap `<ChatContainer>` with `<ErrorBoundary>`

</code_context>

<specifics>
## Specific Ideas

- InfinityLogo size 24px matches AppNav usage in the main all-chat frontend — consistent branding across products
- Header layout with logo centered mirrors a "minimal status bar" pattern — identity (logo) + state (dot) + context (badge)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-design-system*
*Context gathered: 2026-03-12*
