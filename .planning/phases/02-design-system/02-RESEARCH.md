# Phase 2: Design System - Research

**Researched:** 2026-03-12
**Domain:** Tailwind CSS 4, design tokens, CSS isolation, webpack MiniCssExtractPlugin, fontsource, React ErrorBoundary
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Font loading strategy**
- Bundle fonts via `@fontsource/inter` and `@fontsource/dm-mono` (npm packages, self-hosted, offline-capable)
- Inter: weights 400 + 600 only
- DM Mono: weight 400 only
- Fonts scoped to iframe only — `@font-face` declarations live in `chat-styles.css`, loaded via `<link>` in `chat-container.html`

**ChatContainer token depth**
- Full rewrite: replace all `bg-gray-*`, `text-gray-*`, `border-gray-*` in ChatContainer, MessageInput, Toast, LoginPrompt, Autocomplete
- Use semantic class names from the new `@theme` block (`bg-surface`, `text-sub`, `border-border`, etc.)
- Scrollbar hardcoded hex values updated to token references: track → `var(--color-neutral-900)`, thumb → `var(--color-neutral-700)`, hover → `var(--color-neutral-600)`
- Platform accent colors updated to WCAG-AA values (`#A37BFF`, `#FF4444`, `#53FC18`) via `.platform-twitch/.platform-youtube/.platform-kick`

**Header visual scope**
- Full header redesign with InfinityLogo centered
- Layout: `[collapse button (left)] [InfinityLogo 24px (center)] [connection dot + platform badge (right)]`
- InfinityLogo size: 24px
- Connection status: visual dot only (green/yellow/red), no text labels
- Platform badge: small accent-colored indicator using `var(--color-twitch/youtube/kick)`
- Collapse button kept, restyled to match design system

**ErrorBoundary**
- Class component `ErrorBoundary` wraps `ChatContainer` in `src/ui/index.tsx`
- Fallback: centered styled card — error icon, "Chat failed to load", "Try again" button
- Retry: `this.setState({ hasError: false })` — no page reload
- No error details shown to user; error logged to `console.error` only
- Check `ErrorDisplay.tsx` for reuse as fallback card

### Claude's Discretion
- Exact semantic utility class names (e.g. `bg-surface` vs `bg-[var(--color-surface)]`)
- Whether to create `ChatHeader.tsx` or keep header inline in `ChatContainer.tsx`
- `MiniCssExtractPlugin` configuration details (filename, chunk naming)
- How to handle `'use client'` directive in `InfinityLogo.tsx`

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DS-01 | Tailwind 3 fully replaced by Tailwind 4 (`tailwindcss@^4.1` + `@tailwindcss/postcss`); `tailwind.config.js` deleted | Tailwind 4 upgrade guide: replace `tailwindcss: {}` with `@tailwindcss/postcss` in postcss.config.js, remove tailwind.config.js, replace `@tailwind base/components/utilities` with `@import "tailwindcss"` |
| DS-02 | OkLCh design tokens from `all-chat/frontend/src/app/globals.css` applied to iframe `@theme` block | `@theme` in globals.css is the verbatim source; copy the full `@theme {}` block into extension's styles.css |
| DS-03 | `MiniCssExtractPlugin` used for iframe CSS bundle — CSS injected via `<link>` in `chat-container.html` | MiniCssExtractPlugin replaces style-loader in the CSS rule; since HtmlWebpackPlugin uses `inject: false`, add `<link>` manually to chat-container.html template |
| DS-04 | Iframe CSS tokens confirmed isolated — no `--color-neutral-*` on platform page `:root` | iframe document has its own `:root` — @theme variables emitted into chat-styles.css only apply inside the iframe document, not the parent page |
| DS-05 | `InfinityLogo` SVG component integrated into chat header | Copy from `../all-chat/frontend/src/components/InfinityLogo.tsx`, strip `'use client'` directive, keep `useEffect`/`requestAnimationFrame` animation intact |
| DS-06 | Inter font and DM Mono applied to chat UI (scoped to iframe only) | `@fontsource/inter` 400+600 and `@fontsource/dm-mono` 400; import specific weight CSS in styles.css; webpack 5 `asset/resource` handles woff2 files |
| DS-07 | Platform color accents updated (`--color-twitch: #A37BFF`, `--color-youtube: #FF4444`, `--color-kick: #53FC18`) | These values are verbatim in the globals.css `@theme` block that gets copied — no separate action needed beyond DS-02 |
| DS-08 | `autoprefixer` removed from PostCSS config | Tailwind 4 handles vendor prefixes natively; postcss.config.js drops both `autoprefixer: {}` and the autoprefixer devDependency |
| DS-09 | `tailwind-merge` upgraded to v3 | tailwind-merge v3 drops Tailwind 3 support and adds Tailwind 4 support — must be upgraded together with Tailwind 4; current install is `^2.2.0` → upgrade to `^3.0.0` |
| DS-10 | `ErrorBoundary` wraps `ChatContainer` — uncaught errors show readable fallback | Class component with `getDerivedStateFromError` + `componentDidCatch`; functional component ErrorBoundary is NOT supported by React |
</phase_requirements>

---

## Summary

Phase 2 replaces Tailwind 3 with Tailwind 4, applies the OkLCh design token system from the shared all-chat frontend, migrates CSS extraction from style-loader to MiniCssExtractPlugin, bundles Inter and DM Mono fonts via fontsource, integrates the InfinityLogo SVG, and adds an ErrorBoundary around ChatContainer.

The most architecturally significant change is the build pipeline shift: `style-loader` inlines CSS into the JS bundle at runtime, while `MiniCssExtractPlugin` emits a separate `dist/ui/chat-styles.css` file. Because the HtmlWebpackPlugin for chat-container.html uses `inject: false`, the `<link>` tag must be added manually to the template — MiniCssExtractPlugin will not auto-inject it.

CSS token isolation is inherently solved by the iframe architecture. The `@theme` block emits CSS custom properties into `chat-styles.css`; when that file is loaded inside the iframe document, those `:root` variables live on the iframe's own `document` root — completely isolated from the platform page's `:root`. No additional scoping mechanism is needed.

**Primary recommendation:** Follow this migration order: (1) update build tooling (Tailwind 4, MiniCssExtractPlugin, postcss), (2) migrate styles.css (@import + @theme), (3) update all component class names, (4) add fonts, (5) integrate InfinityLogo into redesigned header, (6) add ErrorBoundary.

---

## Standard Stack

### Core (install/upgrade)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tailwindcss` | `^4.2.1` (latest) | Utility CSS framework with OkLCh design tokens | Locked decision; v4 is the current stable release as of 2026 |
| `@tailwindcss/postcss` | `^4.2.1` | PostCSS plugin for Tailwind 4 | Replaces `tailwindcss: {}` in postcss config; required for Tailwind 4 |
| `mini-css-extract-plugin` | `^2.10.1` (latest) | Extracts CSS into separate file | Required by DS-03; replaces style-loader for iframe bundle |
| `@fontsource/inter` | `^5.2.8` (latest) | Self-hosted Inter font (woff2) | Locked decision; weight-selective import, offline-capable |
| `@fontsource/dm-mono` | `^5.2.7` (latest) | Self-hosted DM Mono font (woff2) | Locked decision; monospace font for code/chat |
| `tailwind-merge` | `^3.0.0` | Merge Tailwind classes without conflicts | DS-09: tailwind-merge v3 is required for Tailwind 4 compatibility |

### Removed
| Package | Action | Reason |
|---------|--------|--------|
| `autoprefixer` | Remove from devDependencies + postcss.config.js | Tailwind 4 handles vendor prefixes natively (DS-08) |
| `style-loader` (for chat bundle) | Replace with MiniCssExtractPlugin.loader | DS-03: CSS must be extracted to separate file |

### Deleted Files
| File | Reason |
|------|--------|
| `tailwind.config.js` | DS-01: Tailwind 4 config lives entirely in CSS `@theme` block |

**Installation:**
```bash
npm install tailwindcss@^4.2.1 @tailwindcss/postcss mini-css-extract-plugin @fontsource/inter @fontsource/dm-mono
npm install tailwind-merge@^3.0.0
npm uninstall autoprefixer
```

---

## Architecture Patterns

### Recommended File Structure Changes
```
src/ui/
├── styles.css                # Replace @tailwind directives with @import "tailwindcss" + @theme block + font imports
├── chat-container.html       # Add <link rel="stylesheet" href="chat-styles.css"> manually
├── index.tsx                 # Wrap <ChatContainer> with <ErrorBoundary>
└── components/
    ├── ChatContainer.tsx     # Full class name rewrite (gray-* → token classes) + header redesign
    ├── InfinityLogo.tsx      # NEW: copy from all-chat, strip 'use client'
    ├── ErrorBoundary.tsx     # NEW: class component wrapping ChatContainer
    ├── MessageInput.tsx      # Class name rewrite
    ├── Toast.tsx             # Class name rewrite
    ├── LoginPrompt.tsx       # Class name rewrite
    ├── Autocomplete.tsx      # Class name rewrite
    └── ErrorDisplay.tsx      # Check if reusable as ErrorBoundary fallback card
webpack.config.js             # CSS rule: style-loader → MiniCssExtractPlugin.loader + add MiniCssExtractPlugin
postcss.config.js             # tailwindcss: {} → @tailwindcss/postcss, remove autoprefixer
```

### Pattern 1: Tailwind 4 CSS Entry Point (`styles.css`)
**What:** Replace v3 directives with v4 import + complete @theme block + fontsource imports
**When to use:** This is the single CSS entry — everything flows through here

```css
/* Source: https://tailwindcss.com/docs/upgrade-guide */
@import "tailwindcss";

/* Fontsource — weight-selective imports */
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/dm-mono/400.css";

/* ============================================================
   DESIGN TOKENS — verbatim from all-chat/frontend/src/app/globals.css
   ============================================================ */
@theme {
  /* Base: platform colors (WCAG AA on dark backgrounds) */
  --color-twitch:  #A37BFF;
  --color-youtube: #FF4444;
  --color-kick:    #53FC18;
  --color-tiktok:  #69C9D0;

  /* Neutral scale — oklch with constant chroma ~0.007, hue 270 */
  --color-neutral-950: oklch(0.09 0.007 270);
  --color-neutral-900: oklch(0.11 0.009 270);
  --color-neutral-800: oklch(0.14 0.008 270);
  --color-neutral-700: oklch(0.22 0.007 270);
  --color-neutral-600: oklch(0.35 0.007 270);
  --color-neutral-400: oklch(0.58 0.007 270);
  --color-neutral-200: oklch(0.78 0.005 270);
  --color-neutral-100: oklch(0.91 0.003 270);

  /* Semantic tokens */
  --color-bg:        var(--color-neutral-950);
  --color-surface:   var(--color-neutral-900);
  --color-surface-2: var(--color-neutral-800);
  --color-border:    oklch(from var(--color-neutral-100) l c h / 0.06);
  --color-border-md: oklch(from var(--color-neutral-100) l c h / 0.10);
  --color-text:      var(--color-neutral-100);
  --color-text-sub:  var(--color-neutral-400);
  --color-text-dim:  var(--color-neutral-600);

  /* Typography */
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'DM Mono', ui-monospace, monospace;

  /* Text sizes */
  --text-xs:   0.6875rem;
  --text-sm:   0.8125rem;
  --text-base: 0.875rem;
  --text-lg:   1rem;

  /* Radii */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-full: 9999px;
}

/* Keep existing keyframes and platform classes, updating to token values */
```

### Pattern 2: Tailwind 4 Utility Class Generation from @theme
**What:** Every `--color-*` variable in `@theme` automatically generates `bg-*`, `text-*`, `border-*` utilities
**When to use:** This is how semantic utility names like `bg-surface`, `text-text-sub`, `border-border` are produced

```css
/* Define in @theme: */
@theme {
  --color-surface: var(--color-neutral-900);  /* → bg-surface, text-surface, border-surface */
  --color-text-sub: var(--color-neutral-400); /* → text-text-sub */
  --color-bg: var(--color-neutral-950);       /* → bg-bg */
}
```

**Important naming note:** For `--color-text-sub`, Tailwind generates `bg-text-sub`, `text-text-sub`, `border-text-sub`. The `text-` prefix is part of the token name, not the utility prefix. When in doubt, use `bg-[var(--color-surface)]` syntax for clarity (this is Claude's discretion area).

### Pattern 3: MiniCssExtractPlugin with inject:false HtmlWebpackPlugin
**What:** Extract CSS to `dist/ui/chat-styles.css`; since `inject: false`, add `<link>` manually
**When to use:** Required for DS-03

```javascript
// Source: https://webpack.js.org/plugins/mini-css-extract-plugin/
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// In webpack.config.js:
plugins: [
  new MiniCssExtractPlugin({
    filename: 'ui/chat-styles.css'  // matches expected path in chat-container.html
  }),
  // HtmlWebpackPlugin stays unchanged (inject: false means no auto-injection)
],
module: {
  rules: [
    {
      test: /\.css$/,
      use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader']
    },
    // Add font asset rule (webpack 5 built-in, no file-loader needed):
    {
      test: /\.(woff|woff2|eot|ttf|otf)$/i,
      type: 'asset/resource',
      generator: {
        filename: 'ui/fonts/[name][ext]'
      }
    }
  ]
}
```

**chat-container.html template change:**
```html
<!-- Add BEFORE the existing <script src="chat-bundle.js"> -->
<link rel="stylesheet" href="chat-styles.css">
```

### Pattern 4: React ErrorBoundary (TypeScript class component)
**What:** Catches all React render errors from children, shows fallback UI
**When to use:** Required for DS-10; class component is the only supported React pattern

```typescript
// Source: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[AllChat ErrorBoundary] Uncaught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        // Fallback card using design tokens
        <div className="h-full flex items-center justify-center bg-bg">
          <div className="p-4 rounded-lg bg-surface border border-border text-center">
            <p className="text-sm text-text mb-3">Chat failed to load</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-3 py-1 text-xs rounded bg-surface-2 text-text-sub hover:text-text"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Usage in index.tsx:**
```tsx
root.render(
  <ErrorBoundary>
    <ChatContainer platform={platform} streamer={streamer} />
  </ErrorBoundary>
);
```

### Pattern 5: InfinityLogo Integration
**What:** Copy component from all-chat, strip Next.js directive, render at 24px in header
**When to use:** Required for DS-05

The `'use client'` directive on line 1 of the source file is Next.js-specific. Simply remove that line — the component uses standard React `useEffect` and `useRef` which work in any React environment. The animation uses `requestAnimationFrame` via `useEffect`, which runs correctly in a browser iframe.

```tsx
// src/ui/components/InfinityLogo.tsx
// Strip 'use client' line, keep everything else verbatim
import { useEffect, useRef } from 'react';
// ... rest unchanged
```

**Header layout pattern:**
```tsx
<div className="px-2 py-1.5 bg-surface border-b border-border flex items-center">
  {/* Left: collapse button */}
  <button onClick={toggleCollapse} className="text-text-dim hover:text-text">
    {/* chevron SVG */}
  </button>
  {/* Center: logo (flex-1 + flex justify-center) */}
  <div className="flex-1 flex justify-center">
    <InfinityLogo size={24} />
  </div>
  {/* Right: dot + platform badge */}
  <div className="flex items-center gap-1.5">
    <span className={`w-2 h-2 rounded-full ${dotColorClass}`} />
    <span className={`w-2 h-2 rounded-full platform-dot-${platform}`} />
  </div>
</div>
```

### Anti-Patterns to Avoid
- **Using style-loader for the chat bundle after DS-03:** style-loader inlines CSS into the JS bundle as a `<style>` tag injected at runtime — this means tokens would be on `:root` of the platform page if the script runs there. MiniCssExtractPlugin emits a separate file loaded only inside the iframe.
- **Applying @theme globally across the whole webpack build:** The CSS rule applies to ALL entries. MiniCssExtractPlugin extracts per-entry. Both popup and content scripts share the same CSS pipeline — ensure the Tailwind token CSS is only imported by the `ui/chat-bundle` entry, not popup or content scripts.
- **Using functional component for ErrorBoundary:** React does not support `getDerivedStateFromError` in functional components. The boundary MUST be a class component.
- **Keeping autoprefixer after Tailwind 4 upgrade:** Tailwind 4 handles vendor prefixes natively. Having both causes duplicate prefixes and slower builds.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS custom property isolation | Custom PostCSS scope transform | iframe architecture (already in place) | iframe documents have completely separate DOM trees; `:root` in the iframe is not the platform page `:root` |
| Font self-hosting | Download font files manually, write @font-face | `@fontsource/inter`, `@fontsource/dm-mono` | npm packages include all weights, subsetting, correct @font-face declarations |
| CSS extraction to file | Custom webpack plugin | `mini-css-extract-plugin` | Production-grade, handles code splitting, content hash, source maps |
| Vendor prefix generation | Manual `-webkit-` prefix additions | Tailwind 4 built-in | Tailwind 4's Oxide engine handles this automatically |
| Class name merge deduplication | Custom merge logic | `tailwind-merge` v3 | Handles Tailwind 4 class name semantics; v2 is incompatible with v4 class names |

**Key insight:** The iframe boundary already provides complete CSS isolation. There is no need for CSS scoping tricks, shadow DOM, or PostCSS prefix-wrap — the platform page and the chat UI are in different browser documents.

---

## Common Pitfalls

### Pitfall 1: @theme always emits to :root — misread as leakage risk
**What goes wrong:** Developer sees `:root` in compiled CSS output and worries tokens will leak to platform page.
**Why it happens:** Tailwind 4 docs say `@theme` always targets `:root`. Without understanding iframe document isolation, this looks like a problem.
**How to avoid:** Remember: the CSS file is loaded inside `chat-container.html`, which is the iframe's document. The iframe has its own `:root`. The platform page never loads `chat-styles.css`.
**Warning signs:** If you find CSS variables on the platform page's `:root`, it means `chat-styles.css` was accidentally included in a content script or the platform page itself.

### Pitfall 2: Tailwind 4 class name renames break existing classes
**What goes wrong:** After upgrade, some Tailwind 3 utility classes silently stop applying (no error, just no style).
**Why it happens:** Tailwind 4 renamed several utilities: `shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm`, `outline-none` → `outline-hidden`, `ring` → `ring-3`.
**How to avoid:** Run `npx @tailwindcss/upgrade` codemod on the repo before manual migration. It catches ~90% of renames. Review the diff carefully.
**Warning signs:** Elements that previously had box shadows or ring outlines suddenly appear flat.

### Pitfall 3: Important modifier position changed
**What goes wrong:** `!flex` class works in Tailwind 3 but silently fails in Tailwind 4.
**Why it happens:** Tailwind 4 changed the `!important` modifier from prefix (`!flex`) to suffix (`flex!`).
**How to avoid:** The upgrade codemod handles this. Double-check any `!`-prefixed classes after migration.

### Pitfall 4: Default border color changed
**What goes wrong:** Border utilities (`border`, `divide-*`, `ring`) render as `currentColor` instead of gray.
**Why it happens:** Tailwind 4 changed the default border color from `gray-200` to `currentColor`.
**How to avoid:** Explicitly specify a border color everywhere a border is used: `border border-border` (using the token) instead of just `border`.

### Pitfall 5: MiniCssExtractPlugin applied to all entries, not just chat-bundle
**What goes wrong:** The popup bundle also gets CSS extracted to a separate file, or content scripts fail to build.
**Why it happens:** The webpack CSS rule applies to all matched files regardless of entry point.
**How to avoid:** The popup uses its own HtmlWebpackPlugin entry (with default `inject: true`), so MiniCssExtractPlugin will work correctly for both. Verify `dist/popup/popup.html` still includes the CSS link after migration. Content scripts do not import CSS, so no impact.

### Pitfall 6: font woff2 files not handled by webpack
**What goes wrong:** Build fails with "You may need an appropriate loader to handle this file type" for `.woff2`.
**Why it happens:** Webpack 5 needs an explicit `asset/resource` rule for font files. The current config has no font handling rule.
**How to avoid:** Add the `asset/resource` rule for `/(woff|woff2|eot|ttf|otf)$/i` files (see Pattern 3 above). Webpack 5 built-in; no `file-loader` package needed.

### Pitfall 7: tailwind-merge v2 used with Tailwind 4 class names
**What goes wrong:** `tailwind-merge` fails to correctly deduplicate classes or throws errors on Tailwind 4-specific class names.
**Why it happens:** tailwind-merge v2 was built for Tailwind 3 class name semantics. Tailwind 4 renamed utilities and changed the important modifier position.
**How to avoid:** Upgrade `tailwind-merge` to `^3.0.0` alongside the Tailwind 4 upgrade. Do both in the same PR.

---

## Code Examples

### PostCSS Config (after migration)
```javascript
// Source: https://tailwindcss.com/docs/upgrade-guide
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    // autoprefixer REMOVED — Tailwind 4 handles vendor prefixes natively
  },
}
```

### Webpack CSS Rule (after migration)
```javascript
// Source: https://webpack.js.org/plugins/mini-css-extract-plugin/
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// In rules:
{
  test: /\.css$/,
  use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader']
},
{
  test: /\.(woff|woff2|eot|ttf|otf)$/i,
  type: 'asset/resource',
  generator: { filename: 'ui/fonts/[name][ext]' }
}

// In plugins:
new MiniCssExtractPlugin({ filename: 'ui/chat-styles.css' })
```

### Tailwind 4 install and upgrade
```bash
# Install Tailwind 4 stack
npm install tailwindcss@^4.2.1 @tailwindcss/postcss

# Run the official upgrade codemod (handles ~90% of class renames, config migration)
npx @tailwindcss/upgrade

# Install fontsource packages
npm install @fontsource/inter @fontsource/dm-mono

# Install MiniCssExtractPlugin
npm install --save-dev mini-css-extract-plugin

# Upgrade tailwind-merge
npm install tailwind-merge@^3.0.0

# Remove autoprefixer
npm uninstall autoprefixer
```

### Fontsource CSS import (specific weights)
```css
/* Source: https://fontsource.org/fonts/inter/install */
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/dm-mono/400.css";
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` | `@theme {}` block in CSS | Tailwind v4.0 (Jan 2025) | Config is co-located with CSS; no separate JS config file |
| `@tailwind base/components/utilities` | `@import "tailwindcss"` | Tailwind v4.0 | Single import replaces three directives |
| `tailwindcss: {}` in postcss.config.js | `@tailwindcss/postcss: {}` | Tailwind v4.0 | Separate package handles PostCSS integration |
| `style-loader` inlines CSS into JS | `MiniCssExtractPlugin` emits separate CSS file | Architecture decision (DS-03) | Enables `<link>` loading inside iframe, smaller JS bundle |
| `tailwind-merge` v2 (Tailwind 3 class names) | `tailwind-merge` v3 (Tailwind 4 class names) | tailwind-merge v3.0.0 (2025) | tailwind-merge v3 drops Tailwind 3 support entirely |
| `autoprefixer` in PostCSS | Removed — Tailwind 4 built-in | Tailwind v4.0 | One fewer PostCSS plugin; prefixes handled by Oxide engine |
| Hardcoded hex scrollbar colors (`#18181b`) | CSS variable references (`var(--color-neutral-900)`) | Phase 2 | Scrollbar theming follows the token system |

**Deprecated/outdated:**
- `tailwind.config.js`: replaced by `@theme {}` in CSS. Tailwind 4 no longer auto-detects it.
- `@tailwind` directives: replaced by `@import "tailwindcss"`. Still processed as a compat shim but will be removed in v5.
- `theme()` function in CSS: replaced by `var(--token-name)`. Still works but CSS variables are preferred.

---

## Open Questions

1. **Tailwind 4 class name for semantic tokens with multi-segment names**
   - What we know: `--color-text-sub` generates `text-text-sub`, `bg-text-sub`, etc.
   - What's unclear: Whether `text-text-sub` is readable and acceptable, or whether `text-[var(--color-text-sub)]` is cleaner
   - Recommendation: Claude's discretion — use `text-[var(--color-text-sub)]` for the sub-text token to avoid the doubled `text-text-` prefix; use `bg-surface`, `bg-bg`, `border-border` for the others (they read cleanly)

2. **Popup bundle — does it also get MiniCssExtractPlugin treatment?**
   - What we know: The popup HtmlWebpackPlugin does NOT use `inject: false` — it uses default injection
   - What's unclear: Whether the popup imports any CSS that would be affected
   - Recommendation: The popup uses its own entry point. If it imports CSS, MiniCssExtractPlugin will extract it automatically and HtmlWebpackPlugin will inject the `<link>` tag (since inject defaults to `true`). Verify popup renders correctly after migration.

3. **ErrorDisplay.tsx reuse for ErrorBoundary fallback**
   - What we know: `ErrorDisplay.tsx` takes a `ChatError` typed prop — it's designed for API/platform errors, not React render errors
   - What's unclear: Whether its styling is reusable without the `ChatError` typed interface
   - Recommendation: Do NOT reuse `ErrorDisplay.tsx` directly — it requires a `ChatError` typed prop and contains countdown timers and platform-specific logic. Write a simpler inline fallback in `ErrorBoundary.tsx` using design tokens directly.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright `^1.57.0` |
| Config file | `playwright.config.ts` (root) |
| Quick run command | `npx playwright test --project=chromium-extension` |
| Full suite command | `npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DS-01 | `tailwind.config.js` deleted, `@tailwindcss/postcss` in postcss.config.js | build smoke | `npm run build` exits 0; `ls tailwind.config.js` returns non-zero | ❌ Wave 0 |
| DS-02 | `dist/ui/chat-styles.css` contains `oklch(` color values | build artifact check | `grep -c 'oklch' dist/ui/chat-styles.css` > 0 | ❌ Wave 0 |
| DS-03 | `dist/ui/chat-styles.css` exists; `chat-container.html` has `<link>` referencing it | build artifact check | `ls dist/ui/chat-styles.css` + `grep 'chat-styles.css' dist/ui/chat-container.html` | ❌ Wave 0 |
| DS-04 | Platform page `:root` has no `--color-neutral-*` variables after iframe injection | Playwright + page.evaluate | `page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-neutral-900'))` returns empty | ❌ Wave 0 |
| DS-05 | InfinityLogo SVG visible in chat header inside iframe | Playwright frameLocator | `page.frameLocator('iframe[data-platform]').locator('svg.inf-logo')` or by aria | ❌ Wave 0 |
| DS-06 | Chat UI uses Inter font inside iframe | Playwright frameLocator | `frameLocator.locator('body')` computed style `font-family` contains 'Inter' | ❌ Wave 0 |
| DS-07 | Platform accent colors match spec (WCAG-AA values) | CSS variable check in iframe | `frameLocator` + `getPropertyValue('--color-twitch')` returns `#A37BFF` | ❌ Wave 0 |
| DS-08 | No autoprefixer in postcss.config.js | file content check | `grep -c 'autoprefixer' postcss.config.js` returns 0 | ❌ Wave 0 |
| DS-09 | tailwind-merge at v3+ | package.json check | `node -e "require('tailwind-merge'); console.log('ok')"` | ❌ Wave 0 |
| DS-10 | Uncaught React error in iframe shows fallback card, not blank iframe | Playwright + page injection | Force error in child component, assert fallback text visible via frameLocator | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run build` (verifies webpack compiles without errors)
- **Per wave merge:** `npx playwright test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test-design-system.spec.ts` — covers DS-01 through DS-10 (build artifact checks + iframe inspection)
- [ ] Tests require `npm run build` to run first (build-dependent assertions)
- [ ] DS-05/DS-06/DS-10 require the extension loaded in Playwright (`dist/` must exist with new CSS)

Note: All DS requirement tests are Wave 0 gaps — no existing test file covers design system assertions.

---

## Sources

### Primary (HIGH confidence)
- `https://tailwindcss.com/docs/upgrade-guide` — Tailwind v3→v4 migration: PostCSS plugin change, @import syntax, @theme block, removed options
- `https://tailwindcss.com/docs/theme` — @theme generates utility classes, always emits to :root, cannot be scoped to elements
- `https://webpack.js.org/plugins/mini-css-extract-plugin/` — MiniCssExtractPlugin configuration, filename pattern, inject:false behavior
- `https://fontsource.org/fonts/inter/install` — @fontsource/inter weight-specific import syntax
- `https://react.dev/reference/react/Component` — getDerivedStateFromError, componentDidCatch, ErrorBoundary class pattern
- `../all-chat/frontend/src/app/globals.css` — Verbatim @theme token definitions (source of truth for DS-02)
- `../all-chat/frontend/src/components/InfinityLogo.tsx` — Verbatim source for DS-05

### Secondary (MEDIUM confidence)
- `https://github.com/dcastil/tailwind-merge/releases` — tailwind-merge v3 drops Tailwind 3 support, requires Tailwind 4
- `https://fontsource.org/docs/guides/webpack` — webpack configuration for fontsource; webpack 5 asset/resource confirmed for font files
- `npm info tailwindcss version` → `4.2.1` (verified 2026-03-12)
- `npm info @tailwindcss/postcss version` → `4.2.1` (verified 2026-03-12)
- `npm info mini-css-extract-plugin version` → `2.10.1` (verified 2026-03-12)

### Tertiary (LOW confidence — flagged for validation)
- Tailwind 4 class names for semantic tokens with multi-segment names (e.g. `text-text-sub`) — behavior inferred from namespace documentation, not directly verified with a running build

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed via npm registry, official Tailwind docs verified
- Architecture: HIGH — webpack config patterns from official docs; iframe isolation is a browser fundamental
- Pitfalls: HIGH — Tailwind 4 breaking changes from official upgrade guide; font/webpack from official fontsource docs
- Token naming conventions: MEDIUM — namespace → utility mapping verified via docs; specific multi-segment names inferred

**Research date:** 2026-03-12
**Valid until:** 2026-06-12 (Tailwind 4 is currently active; tailwind-merge v3 released recently — stable for ~90 days)
