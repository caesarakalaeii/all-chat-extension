---
status: open
trigger: "YouTube: switching to the native Chat tab leaves AllChat's overlay visible over the native messages area — native messages (and the pinned banner band above them) are painted but hidden behind the AllChat 'Waiting for messages' placeholder."
created: 2026-04-21T14:50:00Z
updated: 2026-04-21T14:50:00Z
---

## Current Focus

hypothesis: CONFIRMED — `#allchat-container { display: flex !important }` in the outer `allchat-hide-native-style` stylesheet overrides the inline `style.display = 'none'` set by `handleSwitchToYouTube`. The overlay is still drawn at z-index:2 over the full-height native frame, so native messages render underneath but are invisible.
test: Read `#allchat-container`'s computed `display` right after clicking the YouTube Chat tab — it is `flex`, not `none`.
expecting: After the fix below, computed `display` becomes `none` on switch-to-native and the native message list (and pinned banner) fills the column.
next_action: Apply the CSS-and-switch-handler fix described below, rebuild, reload extension, re-verify.

## Symptoms

expected:
- Click **YouTube Chat** tab → AllChat overlay disappears.
- Native chat column shows header + ticker + pinned banner + scrolling messages + input at full size.

actual:
- AllChat overlay stays visible (`display: flex`) at z-index:2.
- Screenshot: the middle band of the chat column shows AllChat's "Waiting for messages — Messages from caesarlp will appear here" placeholder.
- Above AllChat overlay: native `Top Chat` header, 33/50 ticker, and `@News5de` PayPal pinned banner are rendered.
- Below AllChat overlay: native `Livekommentare` input row (heart + info icons).
- The native message list (`#contents > #chat` inside the iframe) has `display: flex` — messages ARE painting, they're just behind the AllChat overlay.

errors: none (no console errors related to this — purely a layout/z-index issue).
reproduction:
1. Open `https://www.youtube.com/watch?v=<any-live-video-id>` (News5de tested, but applies to any live stream the extension injects into).
2. Wait for injection (AllChat tab active by default).
3. Click **YouTube Chat** tab.
4. Observe the middle band of the chat column still shows AllChat's placeholder / cross-platform messages.
started: Introduced in commit `ffc1a72` ("fix(youtube): overlay AllChat over full-height frame so pickers float above") — the overlay architecture added `display: flex !important` to the container rule to force its layout, without a companion hide-on-native-tab mechanism.

## Eliminated

- hypothesis: `handleSwitchToYouTube` doesn't run
  evidence: adding a `console.log` in that handler (or reading the YouTube tab's underline visual) shows the click IS being handled; `switchToNativeTab()` flips the visual indicator. The inline `container.style.display = 'none'` is applied — I verified by reading `container.style.display` (= `'none'`) while `getComputedStyle(container).display` returns `'flex'`.
  timestamp: 2026-04-21

- hypothesis: `showNativeChat()` isn't removing the iframe trim
  evidence: `doc.getElementById('allchat-yt-trim')` is `null` after the switch and the native `#contents > #chat` has `display: flex` (messages are laying out). So the trim IS getting removed. The real problem is upstream: AllChat overlay covers the rendered messages.
  timestamp: 2026-04-21

## Evidence

- timestamp: 2026-04-21
  checked: inline vs computed display on #allchat-container post-switch
  found: `container.style.display === 'none'` but `getComputedStyle(container).display === 'flex'`
  implication: an outer CSS rule with `!important` is winning over the inline style. Only `#allchat-container { display: flex !important; ... }` inside `<style id="allchat-hide-native-style">` matches.

- timestamp: 2026-04-21
  checked: `msgListDisplay` (i.e. `#contents > #chat`) inside the iframe
  found: `flex` — native messages are laid out.
  implication: fix is entirely about hiding the overlay, not restoring the native render.

## Fix plan

Two small edits in `src/content-scripts/youtube.ts`:

1. **Drop `display: flex !important`** from the `#allchat-container` rule in `hideNativeChat()`'s outer stylesheet. Keep the other !important rules (position, left/right, z-index, flex-direction, min-height). Inline `display: flex` from `createInjectionPoint` still sets the initial flex layout; inline `display: none` from `handleSwitchToYouTube` now wins because there's no longer an `!important` override.

   ```diff
    #allchat-container {
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      z-index: 2 !important;
   -  display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
    }
   ```

2. **Guard `handleSwitchToAllChat`** to reset display to `'flex'` (not `''` — see the currently-shipped version which does this correctly). Double-check the switch back still shows the overlay after the fix.

Rebuild, reload extension, and verify with the existing probe in `.planning/notes/extension-live-testing.md`:

```js
await page.evaluate(() => {
  const c = document.getElementById('allchat-container');
  return { inline: c?.style.display, computed: getComputedStyle(c).display };
});
```

- On AllChat tab: both should be `flex`.
- On YouTube Chat tab: inline `none`, computed `none`.

## Related

- commit `ffc1a72` introduced the overlay architecture and this regression.
- Kick overlay follows the same pattern but uses `display: flex !important` too; check if the same regression exists there (manually, I didn't see it in the last run — worth re-verifying since the Kick switch is structurally different: Kick hides the message wrapper via `[data-allchat-msg-wrap]`, not via an overlay).
