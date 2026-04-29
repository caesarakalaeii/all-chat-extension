---
name: Extension live-testing runbook
description: End-to-end testing procedure for the browser extension on live Twitch, Kick, and YouTube streams using Playwright MCP and the allch.at "High Load Extension test" overlay
type: runbook
date: 2026-04-21
---

# Live-testing the browser extension across Twitch, Kick, YouTube

Use this when verifying that the extension correctly replaces native chat content
without obscuring any native chat features (channel points, super chats, emote
picker, pinned messages, gift-sub ticker, etc.). Exercises the real injection
paths — not the mock pages under `tests/fixtures/`.

## Prerequisites

- Playwright MCP browser with the extension's `dist/` loaded as an unpacked
  extension (`chrome://extensions` should show "All-Chat Extension" enabled).
  The MCP profile is separate from your normal Chrome profile.
- The user has an allch.at account (Twitch OAuth). The Playwright MCP's
  Twitch cookies need a one-time manual sign-in — see step 2.
- Build is fresh: `npm run build` produces `dist/`. After any source change,
  reload via `chrome://extensions` → click the refresh icon. The helper
  snippet in step 6 does this programmatically.

## 1. Pick test streams

We want high-traffic, open-chat streams (no follower-only / sub-only — those
hide the real input affordances and we cannot type). Viewer-count thresholds
below are the ones I used; raise/lower as needed.

- **Twitch**: browse `https://www.twitch.tv/directory/all?sort=VIEWER_COUNT`
  and pick a 5K+-viewer stream whose chat is NOT follower-only. Watch for
  `Followers-Only Chat` text in `[data-a-target="room-status"]`. ironmouse
  has worked reliably. Big non-English streamers (ramzes, fps_shaka) often
  gate their chat — skip those.
- **YouTube**: `https://www.youtube.com/results?search_query=live+stream&sp=EgJAAQ%253D%253D`
  is the live-filter URL. Sort by viewer count and grab a channel with
  1K+ active viewers. Extract its UC channel ID from the page
  (`"channelId":"(UC[^"]+)"`). News5de (UCN7ChsGhcFqyhGVKoG1uaQg) is a
  reliable 24/7 German news livestream.
- **Kick**: `https://kick.com/browse?sort=viewers_high_to_low` — any
  10K+-viewer stream. noorgamer typically runs open chat.

## 2. Log into allch.at (one-time per MCP profile)

The MCP profile is isolated and starts without Twitch cookies.

1. Navigate to `https://allch.at/`, dismiss the cookie banner, click
   **Sign in with Twitch**.
2. The page will redirect to `twitch.tv/login`. Ask the user to sign in
   manually in the visible Playwright browser window — the MCP cannot
   safely type credentials. Poll for redirect:

   ```js
   await page.evaluate(() => ({
     url: location.href,
     hasCookie: document.cookie.split(';').some(c => c.trim().startsWith('auth-token=')),
   }));
   ```

   Wait in 30–90s chunks. The browser will bounce through
   `allch.at/auth/callback#access_token=...` to `allch.at/dashboard` once
   login completes.

## 3. Wire up the "High Load Extension test" overlay

Once on `/dashboard`, the overlay likely already exists from a prior
session. If not, click **New Overlay**, name it `High Load Extension test`,
and click **Set as Extension Overlay** — this is what makes the extension
inject on stream pages (it keys off the account's active extension
overlay, served at `allch.at/c/<username>`).

Open the overlay and add the three streams via the `Admin: manual channel
ID` fieldset (the public "Connect …" buttons need per-platform OAuth;
manual add bypasses that):

```js
// Run inside the overlay page in the MCP browser
const details = [...document.querySelectorAll('details')]
  .find(d => d.textContent?.includes('manual channel'));
const form = details.querySelector('form');
const select = form.querySelector('select');
const input = form.querySelector('input');
const btn = form.querySelector('button[type=submit]');
const setSel = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
const setInp = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

const add = (platform, id) => {
  setSel.call(select, platform); select.dispatchEvent(new Event('change', { bubbles: true }));
  setInp.call(input, id);        input.dispatchEvent(new Event('input',  { bubbles: true }));
  btn.click();
};
add('twitch',  'ironmouse');
add('youtube', 'UCN7ChsGhcFqyhGVKoG1uaQg');
add('kick',    'noorgamer');
```

Wait ~2s between calls (the form disables while posting). Then click
**Save Configuration**. The backend registers the streamers, so the
content script's `GET_STREAMER_INFO` check will start returning
`{ success: true }` and the iframe will inject on each stream page.

## 4. Reload the extension after any code change

The MCP browser doesn't auto-reload unpacked extensions. Trigger the
per-extension reload button via DOM:

```js
// Tab: chrome://extensions
const mgr = document.querySelector('extensions-manager');
const list = mgr.shadowRoot.querySelector('extensions-item-list');
for (const item of list.shadowRoot.querySelectorAll('extensions-item')) {
  if (item.shadowRoot.querySelector('#name').textContent.trim() === 'All-Chat Extension') {
    item.shadowRoot.querySelector('#dev-reload-button').click();
    break;
  }
}
```

Then **hard-reload** each stream tab (`browser_navigate` to the same URL).
Soft reload can leave the old content script state around.

## 5. What to verify on each stream

The design principle: the extension replaces the message content and adds
a tab bar. Everything else native stays visible AND interactive even while
the AllChat tab is active.

Run this probe after ~8s of dwell time per platform. If any native feature
is hidden/collapsed/zero-height while AllChat is the active tab, that is a
regression — do NOT silently accept it.

### Twitch (ironmouse)

```js
await page.evaluate(() => ({
  allchat:      !!document.getElementById('allchat-container'),
  tabBar:       !!document.getElementById('allchat-tab-bar'),
  msgListHidden: getComputedStyle(document.querySelector('.chat-list--default')).display === 'none',
  // Everything below must remain truthy:
  emotePicker:  !!document.querySelector('[data-a-target="emote-picker-button"]'),
  chatInput:    !!document.querySelector('[data-a-target="chat-input"], .chat-input__textarea'),
  chatSettings: !!document.querySelector('[data-a-target="chat-settings"]'),
  channelPoints: !!document.querySelector('[data-test-selector="community-points-summary"], [class*="community-points"]'),
  pinnedPresent: !!document.querySelector('[data-test-selector="chat-pinned-message"], .pinned-chat'),
}));
```

Click the emote picker to sanity-check it opens and overlays cleanly.
Switch to the native Twitch Chat tab, confirm messages return (Twitch
messages from the channel, not the cross-platform feed).

### Kick (noorgamer)

```js
await page.evaluate(() => {
  const chatroom = document.getElementById('channel-chatroom');
  const wrap = chatroom?.querySelector('[data-allchat-msg-wrap="1"]');
  return {
    allchat:       !!document.getElementById('allchat-container'),
    tabBar:        !!document.getElementById('allchat-tab-bar'),
    msgWrapHidden: wrap ? getComputedStyle(wrap).display === 'none' : 'no-wrap',
    // Must remain visible:
    headerVisible: !!chatroom?.querySelector('.relative.flex.min-h-\\[38px\\]:not([style*="display: none"])'),
    footerVisible: getComputedStyle(document.getElementById('chatroom-footer')).display !== 'none',
    inputVisible:  !!document.querySelector('#channel-chatroom [contenteditable="true"]'),
  };
});
```

Visually confirm the gift-sub ticker (`One_99999`, `rasha1987`, etc.) is
still scrolling at the top of the chat column — it's a native Kick
feature and the most fragile one. Confirm the "Followers only" badge (if
applicable) and the emote-button in the input row.

### YouTube (any News5de-like livestream)

Architecture is now an **overlay**, not a collapsed frame:
- `ytd-live-chat-frame` is `position: absolute` spanning from the tab bar
  bottom to the column bottom (`z-index: 1`). Height must be ≥400px, not
  the 144px seen with the earlier auto-sizing approach.
- `#allchat-container` is `position: absolute` covering only the middle
  band between the iframe's top stack (header + banner + ticker) and the
  iframe's input renderer (`z-index: 2`).
- The iframe's body is transparent; its input-renderer is pinned
  `position: absolute; bottom: 0` so it stays at the bottom once `#chat`
  is hidden (otherwise the flex collapses and the input floats up next to
  the ticker — easy regression to miss).
- A MutationObserver + ResizeObserver inside the iframe toggles
  `.allchat-picker-active` on the frame when any picker is open (emoji,
  super-chat / product-picker, or `yt-reaction-control-panel-view-model`
  grows past ~60px). That flips the frame's `z-index` to 3, so the
  picker hovers above the AllChat overlay instead of being clipped.

```js
await page.evaluate(() => {
  const frame  = document.querySelector('ytd-live-chat-frame');
  const iframe = frame?.querySelector('iframe');
  const doc    = iframe?.contentDocument;
  const q = sel => doc?.querySelector(sel);
  const container = document.getElementById('allchat-container');
  return {
    frameHeight:       frame?.getBoundingClientRect().height,
    framePosition:     frame ? getComputedStyle(frame).position : null,
    frameZIndex:       frame ? getComputedStyle(frame).zIndex : null,
    containerHeight:   container?.getBoundingClientRect().height,
    containerPosition: container ? getComputedStyle(container).position : null,
    containerZIndex:   container ? getComputedStyle(container).zIndex : null,
    header: q('yt-live-chat-header-renderer')?.offsetHeight,
    banner: q('yt-live-chat-banner-manager')?.offsetHeight,
    ticker: q('yt-live-chat-ticker-renderer')?.offsetHeight,
    input:  (q('yt-live-chat-message-input-renderer')
              || q('yt-live-chat-restricted-participation-renderer'))?.offsetHeight,
    inputAnchoredBottom: (() => {
      const i = q('yt-live-chat-message-input-renderer')
        || q('yt-live-chat-restricted-participation-renderer');
      if (!i) return null;
      const cs = getComputedStyle(i);
      return { position: cs.position, bottom: cs.bottom, top: cs.top };
    })(),
    msgListDisplay: q('#contents > #chat') && getComputedStyle(q('#contents > #chat')).display,
  };
});
```

Assertions:
- `framePosition === 'absolute'`, `frameZIndex === '1'`, `frameHeight > 300`.
- `containerPosition === 'absolute'`, `containerZIndex === '2'`, non-zero height.
- `header` > 0, `ticker` > 0 when super-chats are rolling, `input` > 0.
- `inputAnchoredBottom.position === 'absolute'` AND `bottom === '0px'` —
  this is the thing that breaks when YouTube restructures the iframe DOM.
- `msgListDisplay === 'none'` on the AllChat tab, not set on the YouTube tab.

Picker hover check (visual, needs a signed-in user to trigger):
- Open the emoji / super-chat / reactions picker from the native input.
- The picker must render above the AllChat messages. Inspect the frame
  for `.allchat-picker-active` and confirm `getComputedStyle(frame).zIndex`
  flipped to `3`.
- Close the picker and confirm the class is removed.

Switch to the native YouTube Chat tab and confirm the chat is **full
size** — `frameHeight` stays unchanged, and messages + pinned banner +
ticker + input render at their natural positions. If the chat looks
shrunk, `showNativeChat()` failed to disconnect its observers (they
re-clamp inline styles on the frame). Check `ytStackResizeObserver`
and friends — they must be null after a switch-to-native.

## 6. Full-session recipe (all platforms)

Rough order that's been reliable:

1. `npm run build`
2. Reload extension (snippet in step 4)
3. `browser_navigate` to the Twitch stream, wait 7s, run the Twitch probe,
   screenshot if diagnosing.
4. Same for Kick (wait ~8s; Kick's SPA is slower).
5. Same for YouTube (wait ~12–15s; the iframe + ResizeObserver loop needs
   time to settle on first paint).
6. For each platform, click the native tab (`#allchat-tab-native`),
   screenshot, then click back to AllChat (`#allchat-tab-allchat`) and
   confirm nothing got stuck.

## Common failure modes

- **"Streamer not in database" log on Twitch**: the allch.at backend
  hasn't indexed that streamer yet. Add them as a manual source on the
  overlay, save, and re-navigate.
- **Kick: chat doesn't inject at all**: verify the stream is live — Kick's
  `isLiveStream()` hits the API and skips injection on VODs / offline.
- **YouTube frame collapses to 56px after fix**: the children's
  `offsetHeight` is racing the `hidden` stylesheet. The resize path
  already schedules 3 delayed re-measures (500 / 1500 / 3000 ms); if
  still zero, the CSS selector is matching too much (check that
  `#chat-messages` is NOT being hidden — hiding it nukes header and
  input along with the messages).
- **"followers-only" text found in body but chat is actually open**: the
  phrase appears in Twitch's tour/footer HTML even on open streams.
  Detect via the `[data-a-target="room-status"]` element specifically,
  not body.textContent.
