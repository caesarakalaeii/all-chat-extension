# Phase 3: Kick Platform - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Kick.com as a third supported platform: content script detection, DOM slot injection, manifest/webpack wiring, SPA navigation handling, and selector fallback chain. Also fix postMessage origin validation across all platforms (cross-cutting prerequisite for Kick). No design system changes, no backend changes — platform support and security hardening only.

</domain>

<decisions>
## Implementation Decisions

### Live stream detection
- Content script runs on kick.com/* (via manifest match) but only injects if we confirm a live stream
- Detection is two-tier: primary check + fallback
  1. **Primary:** Look for a live badge element in the DOM (Kick shows a LIVE indicator when streaming)
  2. **Fallback:** If live badge not found, check if the chat slot exists and is visible (`#channel-chatroom` or fallback selectors) — if yes, proceed with injection
- If neither signal found: do nothing (native Kick chat stays visible, `console.warn` emitted)
- Same `isLiveStream()` override pattern as `YouTubeDetector` — Kick needs its own check

### Selector verification (blocker)
- The selectors `#channel-chatroom`, `#chatroom`, `.chatroom-wrapper` have NOT been verified against a live kick.com page
- The plan must include a **CHECKPOINT task** as the first item: manually load a live Kick stream, confirm selectors in DevTools, update the KICK-07 date-comment with confirmed selector
- Execution of the injection plan is blocked until this checkpoint is completed and confirmed

### Selector fallback chain (KICK-07)
- Primary: `#channel-chatroom`
- Fallback 1: `#chatroom`
- Fallback 2: `.chatroom-wrapper`
- Include a date-comment on each entry for maintenance visibility (matches KICK-07 requirement)
- Exact selectors may be revised after manual verification at the checkpoint

### SPA navigation (KICK-06)
- Use `popstate` event + `pushState` intercept (Kick is likely Next.js — no platform-specific navigation event like YouTube's `yt-navigate-finish`)
- Pattern: monkey-patch `history.pushState` to emit a custom event, listen for both `popstate` and the custom event
- Same deduplication approach as YouTube: compare `location.href` before and after to avoid double-initialization

### postMessage origin hardening (KICK-05) — separate Wave 1 plan
- **Both sides** of the postMessage channel must be locked down:
  - Content script: change `iframe.contentWindow.postMessage(data, '*')` → `iframe.contentWindow.postMessage(data, extensionUrl)` where `extensionUrl = chrome.runtime.getURL('')`
  - Iframe message listener (`src/ui/index.tsx` or wherever `window.addEventListener('message', ...)` lives): add `if (event.origin !== chrome.runtime.getURL('').slice(0, -1)) return;` guard before processing
- Origin whitelist: **extension origin only** — no `allch.at`, no platform origins
- This change affects all platforms (Twitch, YouTube, Kick) — must be tested against existing platforms for regression
- Implemented as a **separate Wave 1 plan** that runs before the Kick injection plan (Wave 2)

### Claude's Discretion
- Exact live badge selector on Kick (e.g., `.live-badge`, `[data-state="live"]`, etc.) — researcher should investigate current Kick DOM
- Whether to wrap `history.pushState` monkey-patch in a try/catch or let it fail loudly
- Exact `chrome.runtime.getURL('')` trimming to derive the extension origin string

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PlatformDetector.waitForElement()`: already implemented, shared — Kick uses same 200ms pre-delay + 100ms poll + 10s timeout pattern
- `PlatformDetector.teardown()`: shared base teardown — Kick calls `super.teardown()` and adds Kick-specific cleanup
- `YouTubeDetector.isLiveStream()`: reference implementation — KickDetector needs equivalent `isLiveStream()` override
- `TwitchDetector.hideNativeChat()` + `showNativeChat()` using `<style id="allchat-hide-native-style">`: reuse this pattern for Kick
- `PlatformDetector.init()`: base init is reused — KickDetector calls `super.init()` after passing the `isLiveStream()` check
- `PlatformDetector` already types `platform` as `'twitch' | 'youtube' | 'kick' | 'tiktok'` — no type changes needed

### Established Patterns
- Content script entry file at `src/content-scripts/{platform}.ts` — create `src/content-scripts/kick.ts`
- Webpack entry: `'content-scripts/kick': './src/content-scripts/kick.ts'` in `webpack.config.js`
- manifest.json pattern for content script: matches array + js + css + `run_at: "document_idle"`
- `web_accessible_resources` must include `kick.com/*` in the matches array (alongside existing Twitch/YouTube entries)
- Current postMessage: `iframe.contentWindow.postMessage(data, '*')` in content scripts — used in both `twitch.ts` and `youtube.ts`
- Iframe side listener: `window.addEventListener('message', ...)` in `src/ui/index.tsx` — this is where origin validation guard is added

### Integration Points
- `manifest.json`: add Kick `content_scripts` entry, add `https://kick.com/*` to `host_permissions`, add `kick.com/*` to `web_accessible_resources` matches
- `webpack.config.js`: add `'content-scripts/kick'` entry
- `src/content-scripts/kick.ts`: new file implementing `KickDetector extends PlatformDetector`
- `src/content-scripts/twitch.ts` + `src/content-scripts/youtube.ts`: update `postMessage` calls to use extension URL instead of `'*'`
- `src/ui/index.tsx`: add origin validation guard in the `window.addEventListener('message', ...)` handler

</code_context>

<specifics>
## Specific Ideas

- The CHECKPOINT for selector verification should happen before any Kick injection code is written — confirms DOM targets are real
- postMessage hardening plan should run first (Wave 1) and include a regression test against Twitch + YouTube before Kick code is added

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-kick-platform*
*Context gathered: 2026-03-12*
