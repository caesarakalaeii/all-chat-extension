# Technology Stack

**Project:** all-chat-extension — Design System + LLM Testing milestone
**Researched:** 2026-03-12
**Scope:** Only additions/upgrades needed for this milestone. Existing working stack (Webpack 5, React 18, Chrome MV3, Playwright) is NOT re-researched.

---

## What We Are Adding

Three focused additions on top of the working stack:

1. **Tailwind 4 `@theme` design system** — align extension iframe with all-chat frontend tokens
2. **LLM-agent-driven Playwright testing** — Claude/GPT as the test "user"
3. **Build tooling** — Vite vs Webpack 5 for this context

---

## 1. Tailwind 4 Design System in the Chrome Extension Iframe

### Recommendation: Upgrade Tailwind 3 → Tailwind 4 in the extension

**Why:** The all-chat frontend (`../all-chat/frontend`) is already on Tailwind 4.1.18 with a CSS-native `@theme` block defining all OkLCh color tokens, typography scale, and spacing. The extension needs those same tokens. Implementing them in Tailwind 3 means maintaining a parallel JS config that will drift. Upgrading to Tailwind 4 lets the extension import the same `@theme` CSS block the frontend uses — or a slimmed-down copy of it — and the tokens stay in sync automatically via a shared CSS file.

**Tailwind 4 is stable** (released January 22, 2025; currently at 4.1.x as of the all-chat frontend's `^4.1.18`).

### How to apply @theme tokens inside the extension iframe

The iframe (`chat-container.html`) is a fully isolated document. CSS inside it does not leak to or receive leakage from the host page. This is the key property that makes Tailwind 4 in an extension safe: the `@theme` block defines CSS custom properties scoped to `:root` of the iframe document — the host Twitch/YouTube/Kick page never sees them.

**Migration path:**

```css
/* src/ui/styles.css — replace Tailwind 3 directives */

/* Replace the three @tailwind directives with: */
@import "tailwindcss";

/* Inline the design-system tokens from all-chat/frontend/src/app/globals.css */
/* Strip the font-bridge (@theme inline) and body grid background — extension-irrelevant */
@theme {
  --color-twitch:  #A37BFF;
  --color-youtube: #FF4444;
  --color-kick:    #53FC18;

  --color-neutral-950: oklch(0.09 0.007 270);
  --color-neutral-900: oklch(0.11 0.009 270);
  --color-neutral-800: oklch(0.14 0.008 270);
  --color-neutral-700: oklch(0.22 0.007 270);
  --color-neutral-600: oklch(0.35 0.007 270);
  --color-neutral-400: oklch(0.58 0.007 270);
  --color-neutral-200: oklch(0.78 0.005 270);
  --color-neutral-100: oklch(0.91 0.003 270);

  --color-bg:        var(--color-neutral-950);
  --color-surface:   var(--color-neutral-900);
  --color-surface-2: var(--color-neutral-800);
  --color-border:    oklch(from var(--color-neutral-100) l c h / 0.06);
  --color-text:      var(--color-neutral-100);
  --color-text-sub:  var(--color-neutral-400);
  --color-text-dim:  var(--color-neutral-600);

  --text-xs:   0.6875rem;
  --text-sm:   0.8125rem;
  --text-base: 0.875rem;
  --text-lg:   1rem;

  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-full: 9999px;
}
```

**Webpack 5 compatibility:** Tailwind 4 ships as a standard PostCSS plugin (`@tailwindcss/postcss`). The existing `postcss-loader` in `webpack.config.js` works without changes. Only `postcss.config.js` needs updating: replace the `tailwindcss: {}` entry with `"@tailwindcss/postcss": {}`. The `tailwind.config.js` file is no longer needed and should be deleted.

**What to delete:**
- `tailwind.config.js` — v4 has no JS config; all config is in CSS
- `autoprefixer` dev dependency — Tailwind 4 handles vendor prefixes natively
- `tailwindcss: {}` entry in PostCSS config

**What to install:**
```bash
npm install -D tailwindcss@^4.1 @tailwindcss/postcss
npm uninstall autoprefixer
```

**CSS isolation confirmation:** The `@theme` block generates CSS custom properties on `:root`. In an iframe context, `:root` is the iframe's own document root — completely isolated from the parent page. This is HIGH confidence based on standard CSS scoping rules; no special precautions needed.

**What NOT to use:**
- Do NOT use `tailwind-merge` v2 with Tailwind v4 — class names changed (e.g., `shadow` → `shadow-sm`). Upgrade to `tailwind-merge@^3` or audit carefully.
- Do NOT use `@theme inline` (the `@theme inline` variant is a Next.js font bridge pattern — maps Next.js CSS vars to Tailwind utilities). The extension has no Next.js fonts.
- Do NOT replicate `tw-animate-css` (frontend dependency) unless animation classes are needed — adds unnecessary bundle weight.

| Package | Version | Purpose | Action |
|---------|---------|---------|--------|
| `tailwindcss` | `^4.1` | Core framework | Upgrade from 3.4 |
| `@tailwindcss/postcss` | `^4.1` | PostCSS plugin (replaces `tailwindcss: {}`) | Install |
| `tailwind-merge` | `^3.x` | Class deduplication | Upgrade from 2.x |
| `autoprefixer` | — | Vendor prefixes | Remove (handled by TW4) |
| `tailwind.config.js` | — | JS config | Delete |

**Confidence:** HIGH for Tailwind 4 mechanics (verified via official docs, January 2025 stable release). HIGH for PostCSS/Webpack compatibility (standard PostCSS plugin interface). HIGH for iframe CSS isolation (CSS standard scoping).

---

## 2. LLM-Agent-Driven Playwright Testing

### Recommendation: Stagehand (`@browserbasehq/stagehand`) wrapping existing Playwright setup

**Why Stagehand over direct LLM API calls:**

The alternative — Playwright test helpers that manually take screenshots and POST to the Anthropic API — works but requires building the entire agentic loop yourself: screenshot → resize to token budget → call API → parse action → dispatch Playwright action → repeat. Stagehand has already built this loop and exposes it as `act()`, `extract()`, and `observe()` — three semantic verbs that cover the test scenarios needed here. It runs on top of the existing Playwright instance, so the extension loading logic in `playwright.config.ts` (the `--load-extension` flags) is preserved without changes.

**How it works at test level:**

```typescript
// tests/agent/twitch-chat-visibility.spec.ts
import { test, expect } from '@playwright/test';
import { Stagehand } from '@browserbasehq/stagehand';

test('chat panel is visible on a live Twitch stream', async ({ page }) => {
  const stagehand = new Stagehand({ page, apiKey: process.env.ANTHROPIC_API_KEY });

  await page.goto('https://www.twitch.tv/somestreamer');
  await page.waitForTimeout(5000);

  const isVisible = await stagehand.extract({
    instruction: 'Is there a chat panel visible on the right side of the page?',
    schema: z.object({ chatVisible: z.boolean(), reason: z.string() })
  });

  expect(isVisible.chatVisible).toBe(true);
});
```

The `extract()` call takes a screenshot, sends it to the LLM with the instruction, and returns structured data. No DOM selectors. The test still uses `expect()` from Playwright — failure output is identical to normal Playwright tests.

**LLM backend:** Stagehand supports both Anthropic (claude-3-5-sonnet, claude-3-7-sonnet) and OpenAI (gpt-4o). Use `claude-3-5-sonnet-20241022` for visual tasks — it has the strongest screenshot understanding at the lowest latency/cost tradeoff. Set the model explicitly in the Stagehand constructor; do not rely on the default.

**Extension-testing constraint:** The Playwright config is already set to `headless: false`. Stagehand requires a visible browser for screenshot-based agent tasks. This is already satisfied. No config changes needed here.

**What NOT to use:**
- Do NOT use Claude computer use API directly (`computer_20250124` tool) — it drives a full desktop environment and is overkill/expensive for this use case. Stagehand's screenshot-and-interpret loop is the right level of abstraction for testing a UI inside a browser tab.
- Do NOT use the Playwright MCP server (Microsoft's `playwright-mcp` package) for test-driving — it is designed for agentic workflows where Claude drives a browser interactively, not for embedding assertions inside Playwright test suites.
- Do NOT replace all existing Playwright tests with agent tests — LLM API calls add latency (1-5s per `extract()` call) and cost. Keep selector-based tests for mechanical flows with stable anchors.

**CI considerations:** Agent tests require `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) as a CI secret. They also require a headed browser (`headless: false`). Tag them `@agent` and run in a separate Playwright project or via `--grep` filtering so they do not block fast local feedback loops.

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@browserbasehq/stagehand` | latest `^1.x` | LLM-driven browser agent wrapping Playwright | Verify exact version at install time |
| `zod` | `^3` | Schema validation for `extract()` return types | May already be transitive; check |
| `@anthropic-ai/sdk` | `^0.x` latest | Anthropic API client (Stagehand peer dep) | Check Stagehand's peer deps for exact version |

**Confidence:** MEDIUM. Stagehand was the established open-source option as of August 2025 (training data cutoff). The Tailwind v4 stable release date (January 2025) is verified. Stagehand's current API and version should be confirmed against `https://github.com/browserbase/stagehand` before implementation. The architectural pattern (screenshot → LLM → structured output → Playwright assertion) is sound regardless of which library implements it.

---

## 3. Build Tooling: Vite vs Webpack 5

### Recommendation: Keep Webpack 5

**Why NOT migrate to Vite for this milestone:**

Vite is a better DX for most web projects in 2025. However, for Chrome Manifest V3 extensions, Vite requires a plugin to handle the multi-entry point constraints specific to extensions:

- **Service workers** must be a single bundled file with no dynamic imports (Vite's ESM-first output requires special handling)
- **Content scripts** have the same constraint — no module-format output, must be IIFE or similar
- **Multiple distinct entry points** (background, content-scripts/twitch, content-scripts/youtube, ui/chat-bundle, popup/popup) require the Vite multi-page setup or a dedicated plugin

The main Vite extension plugin (`CRXJS`) has had maintenance gaps. The alternative (`vite-plugin-web-extension`) is actively maintained but adds migration risk and new configuration surface area for zero functional gain in this milestone.

**The current Webpack 5 setup works.** The Tailwind 4 upgrade (the main CSS change) integrates via `postcss-loader` without touching the Webpack config. Adding a new content script (`src/content-scripts/kick.ts`) is a one-line entry addition to `webpack.config.js`.

**Defer Vite migration to a dedicated tooling milestone** where it can be validated in isolation without coupling to design system and testing changes.

**When Vite migration would be worth revisiting:**
- If HMR during extension development becomes a bottleneck (Webpack watch is slow for large projects)
- If `vite-plugin-web-extension` reaches a stable 1.0 with clear MV3 service worker support documentation
- As a standalone milestone with its own test pass

**What NOT to do:**
- Do NOT use CRXJS (`@crxjs/vite-plugin`) — it has been in maintenance limbo and is not recommended for new projects as of 2025
- Do NOT mix Vite for the iframe UI and Webpack for the extension shell — two build systems for one project is high complexity

| Tool | Decision | Rationale |
|------|----------|-----------|
| Webpack 5 | Keep | Works, zero migration risk, Tailwind 4 integrates via PostCSS |
| Vite | Defer | Extension-specific MV3 constraints require plugins; migration risk not justified this milestone |
| CRXJS | Reject | Maintenance status uncertain |
| vite-plugin-web-extension | Defer | Viable future option; not worth the risk mid-milestone |

**Confidence:** HIGH for keeping Webpack (the working config is verified). MEDIUM for CRXJS status (training data; confirm current repo activity before any future consideration). HIGH for Tailwind 4 PostCSS compatibility with postcss-loader (verified via official docs).

---

## Complete Package Delta for This Milestone

### Install

```bash
# Tailwind 4
npm install -D tailwindcss@^4.1 @tailwindcss/postcss

# LLM agent testing
npm install -D @browserbasehq/stagehand zod

# tailwind-merge v3 (required for Tailwind 4 class name changes)
npm install tailwind-merge@^3
```

### Remove

```bash
npm uninstall autoprefixer
# Delete tailwind.config.js
```

### Update postcss.config.js (or create if missing)

```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

---

## Summary Table

| Category | Current | Target | Action |
|----------|---------|--------|--------|
| Tailwind | 3.4.1 | 4.1.x | Upgrade — CSS @theme replaces JS config |
| PostCSS plugin | `tailwindcss: {}` | `@tailwindcss/postcss: {}` | Update postcss.config.js |
| Autoprefixer | 10.4.17 | — | Remove (TW4 handles it) |
| tailwind.config.js | Plain extend config | — | Delete |
| tailwind-merge | 2.2.0 | 3.x | Upgrade (TW4 class names changed) |
| LLM test agent | — | Stagehand ^1.x | Install |
| Build tool | Webpack 5 | Webpack 5 | Keep |
| React | 18.3.0 | 18.3.0 | Keep |
| Playwright | 1.57.0 | 1.57.0 | Keep |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Design system CSS | Tailwind 4 @theme | Keep Tailwind 3 + replicate tokens as JS config | Diverges from frontend; JS config cannot use oklch() functions inline; maintenance drift |
| LLM agent library | Stagehand | Direct Anthropic SDK + custom screenshot loop | Stagehand is purpose-built for this; custom loop requires building the action-dispatch-verify cycle from scratch |
| LLM for visual assertions | Claude claude-3-5-sonnet | GPT-4o | Claude has stronger visual reasoning on UI screenshots in benchmarks; Stagehand supports both if needed |
| Build tool | Webpack 5 (keep) | Vite + vite-plugin-web-extension | Extension MV3 constraints make Vite migration non-trivial; no functional gain for this milestone |
| CSS isolation strategy | Iframe (keep existing) | Shadow DOM | Iframe is proven and simpler; Shadow DOM has CSS custom property inheritance issues that would complicate the @theme approach |

---

## Sources

- Tailwind CSS v4.0 official blog post (January 22, 2025): https://tailwindcss.com/blog/tailwindcss-v4
- Tailwind CSS v4 PostCSS installation guide: https://tailwindcss.com/docs/installation/using-postcss
- Tailwind CSS upgrade guide: https://tailwindcss.com/docs/upgrade-guide
- all-chat frontend `globals.css` — read directly from `../all-chat/frontend/src/app/globals.css` (HIGH confidence, authoritative source for exact token values)
- all-chat frontend `package.json` — confirmed tailwindcss@^4.1.18, @tailwindcss/postcss@^4.1.18 (HIGH confidence)
- Stagehand GitHub / npm — MEDIUM confidence (training data, August 2025 cutoff; verify current API at https://github.com/browserbase/stagehand before implementation)
- CRXJS maintenance status — MEDIUM confidence (training data; check https://github.com/crxjs/chrome-extension-tools before any reconsideration)
