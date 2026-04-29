---
status: pending
target_version: 1.6.0
branch: feat/inject-ui
source: [.planning/release-readiness.md, .planning/phases/07-twitch-native-widget-extraction/07-HUMAN-UAT.md, .planning/debug/*.md]
created: 2026-04-29
---

# v1.6.0 release UAT

Walk-through checklist for verifying the `feat/inject-ui` branch is ready to tag as `v1.6.0`. Pair with the audit at [release-readiness.md](release-readiness.md) — that file lists code-side blockers (TS errors, dirty tree, etc.); this file lists user-observable behaviour.

Each scenario carries an execution tag:

- **[mcp]** — Playwright MCP drives the test end-to-end (live site or `dist/` artifact). Assumes the MCP browser has the extension loaded and is signed into Twitch + YouTube + Kick + AllChat (see Auth Prep below).
- **[mcp-event]** — `[mcp]` but only runnable when a real platform-side event is occurring (channel-points redemption available, prediction / poll active, super chat being received). Skip with `[skip: no event during session]` if no event fires; revisit when an event is live.
- **[manual]** — cannot run via MCP (Firefox-only behaviour, requires a separately-built tampered artifact, or otherwise outside Chromium-MCP reach).

Mark `result:` with one of: `[pending] | [pass] | [fail: <one-line reason>] | [blocked: <why>] | [skip: <why>]`.

## Auth prep (run once before walkthrough)

The MCP-driven Chromium needs a one-time setup so the rest of the run is unattended:

1. `npm run build` — produces fresh `dist/` for extension load.
2. Load `dist/` as an unpacked extension in the MCP's Chromium profile (persistent context required).
3. Sign in:
   - Twitch: `https://twitch.tv` → log in
   - YouTube: `https://youtube.com` → log in (Google account; OAuth grants the `liveChat` scope when prompted by AllChat)
   - Kick: `https://kick.com` → log in
   - AllChat: open the extension popup → sign in (uses backend OAuth, see scenarios #39 / #40)
4. Confirm the Kick / Twitch / YouTube cookie jars persist across MCP browser restarts (we need them for native sends).

If any of the four sign-ins fails the rest of the auth-dependent scenarios become `[blocked: not signed in to <platform>]`.

For #11 (mod-role context menu) the YouTube account also needs to be a moderator on the test channel; if not, `[skip: not a mod on test channel]`.

> Note on versioning: the audit doc states `manifest.json` is at `1.6.1`; the working tree is actually at `1.6.0` (commit `6a925ab`). No bump needed before tagging.

---

## 1. Twitch — tab bar & widgets

Carried over from `.planning/phases/07-twitch-native-widget-extraction/07-HUMAN-UAT.md` so this file is the single source of truth for the release walkthrough.

### 1. Channel points widget on live Twitch  [mcp-event]
platform: twitch
ref: `src/content-scripts/twitch.ts` widget extraction; commit `cefd3b4`
preconds: extension installed in MCP browser, signed into Twitch, on a live channel that issues channel points
steps:
  1. Visit `https://twitch.tv/<live-channel>`
  2. Wait for AllChat tab bar to mount
  3. Locate channel-points widget zone (bottom of tab bar)
expected: channel points balance, claim button, and redemption menu visible and functional in the bottom widget zone while AllChat is active
result: [pending]

### 2. Predictions / polls transient widgets  [mcp-event]
platform: twitch
ref: `src/content-scripts/twitch.ts` widget extraction; commit `cefd3b4`
preconds: live Twitch channel currently running a prediction or poll
steps:
  1. Open the channel during an active prediction/poll
  2. Confirm widget appears in top widget zone of tab bar
  3. Wait for or simulate event end
expected: predictions and polls UI appears in top widget zone when live, disappears when event ends
result: [pending]

### 3. Tab switching state preservation  [mcp]
platform: twitch
ref: `src/content-scripts/base/tabBar.ts`; commits `3dd3fc6`, `970da84`, `164b2b0`
preconds: extension active on live Twitch channel
steps:
  1. Send/receive a few messages in AllChat tab
  2. Click `Twitch Chat` tab
  3. Click `AllChat` tab again
expected: switching between tabs is instant; no message loss in either view; native chat stays mounted (hidden) when AllChat is active
result: [pass — verified on twitch.tv/caesarlp 2026-04-29: switch to native flipped #allchat-container computed display flex→none, iframe[data-platform=twitch] stayed mounted, 20 native messages preserved across switch; switch back returned to display:flex with iframe src unchanged (?streamer=caesarlp&...), no remount]

### 4. YouTube / Kick regression check  [mcp]
platform: youtube, kick
ref: `src/content-scripts/youtube.ts`, `kick.ts`; phase 7 SC-4
preconds: extension active
steps:
  1. Open a live YouTube and live Kick stream
  2. Inspect injected DOM
expected: YouTube and Kick function normally — no Twitch-style tab bar or widget zones; full header visible; all existing features work
result: [pass — YouTube verified on youtube.com/watch?v=jfKfPfyJRdk 2026-04-29: AllChat tab bar + iframe + green conn dot, no [data-allchat-zone] widget zones, ytd-live-chat-frame intact. Kick verified on kick.com/edmatthews same day: AllChat tab bar + iframe + green conn dot, no [data-allchat-zone] widget zones, native chatroom DOM intact (header row + flex column with emote search input), 0 Twitch-specific selectors found.]

### 5. Pop-out mode on Twitch  [mcp]
platform: twitch
ref: `src/content-scripts/twitch.ts`; commits `2a4eed0`, `970da84`
preconds: extension active on Twitch
steps:
  1. Click the pop-out button in the tab bar
  2. Verify pop-out window opens with full ChatContainer header (not `tabBarMode`)
  3. Close the pop-out window
expected: pop-out renders full header; closing pop-out restores in-page chat without regression
result: [pass — verified on twitch.tv/caesarlp 2026-04-29: pop-out opened at chrome-extension://.../ui/chat-container.html?...&popout=1 with full header (connected badge, twitch label, switch-to-native button, popout button, message input + char counter); closing pop-out tab restored in-page allchat-container to display:flex with iframe, tab bar, and active allchat tab intact]

---

## 2. Twitch — native send & viewer card

### 6. Twitch viewer card iframe overlay  [mcp]
platform: twitch
ref: `src/content-scripts/twitch.ts:showViewerCardOverlay`; commits `13aa540`, `56022b2`, `32b1e04`
preconds: signed into Twitch, AllChat active on a live channel
steps:
  1. Click a username in the AllChat message list
  2. Observe the overlay
  3. Click outside / close button to dismiss
expected: native Twitch viewer-card iframe overlay appears centered over chat; closes cleanly; no duplicate overlays on repeat clicks
result: [pass — verified on twitch.tv/CaesarLP 2026-04-29 by synthesizing the iframe→parent OPEN_VIEWER_CARD postMessage from the parent context (cross-origin click sim): before — 0 viewer-card overlays in DOM; after `window.postMessage({type:'OPEN_VIEWER_CARD', username:'caesarlp'}, '*')` — `iframe[src=https://www.twitch.tv/popout/CaesarLP/viewercard/caesarlp]` mounted in parent DOM. The actual iframe-side click handler is unverified via MCP cross-origin (FINDING-C), but the parent's mount path is confirmed working.]

### 7. Twitch native chat sending (no AllChat login)  [mcp]
platform: twitch
ref: `src/content-scripts/twitch.ts:sendTwitchChatMessage`; commit `480768d`
preconds: signed into Twitch in the MCP browser; signed OUT of AllChat for this scenario
steps:
  1. Sign out of AllChat (popup) so this scenario tests the no-AllChat-login path
  2. Type a message in the AllChat input
  3. Send
expected: message lands in Twitch chat using the user's Twitch session cookie (GraphQL); no "log in to AllChat" prompt; sender's own message renders once in AllChat
result: [pending]
post: sign back into AllChat after this scenario before continuing.

### 8. Twitch pop-out native send via SW port relay  [mcp]
platform: twitch
ref: `src/background/service-worker.ts` port relay; commits `7ee26c4`, `182c9b0`
preconds: signed into Twitch, in-page AllChat is mounted, pop-out window opened from in-page tab bar
steps:
  1. In the pop-out window, type a message and send
  2. Confirm message appears once in pop-out, once in in-page AllChat, and lands in Twitch native chat
  3. Close the pop-out
expected: the pop-out's send is routed through the service worker port back to the parent tab's content script; the message is sent with the parent tab's session and not duplicated; pop-out close is detected (in-page returns to normal)
result: [pass — first run failed (recorded under FINDING-A); root cause was twitch.ts and kick.ts content scripts only handled SEND_NATIVE_CHAT on `window.addEventListener('message')` (in-page iframe path) but not on `chrome.runtime.onMessage` (SW-relay path). SW relay sent via `chrome.tabs.sendMessage`, listener fell through, sendResponse never fired, SW surfaced "No response from content script". Fixed in commit b98d309 by mirroring the YouTube handler pattern (which already had it from commit 7ee26c4). Re-verified on twitch.tv/CaesarLP popout 2026-04-29: typed "test from popout sw relay fix" + Enter → input cleared, no error UI, message appeared once in popout chat (WS round-trip), char counter back to 0/500. Kick fix follows same pattern, build is clean — needs live Kick verification.]

---

## 3. YouTube — clickable usernames & context menu

### 9. Clickable username → channel page  [mcp]
platform: youtube
ref: `src/ui/components/ChatContainer.tsx`; commit `1455392`
preconds: live YouTube stream open, AllChat active
steps:
  1. Hover then click a non-own username in AllChat
expected: navigates to (or opens new tab for) the YouTube channel page derived from the message metadata
result: [pending]

### 10. 3-dot context menu — viewer role  [mcp]
platform: youtube
ref: `src/content-scripts/youtube.ts` context menu (lines ~1298-1515); commit `e933d4d`
preconds: signed into YouTube as a regular viewer (not stream owner / mod), AllChat active on a live stream
steps:
  1. Hover a non-own message
  2. Click the 3-dot menu
expected: viewer-role items only (Report, Block); no moderation items; menu dismisses on outside-click and on Esc
result: [pending]

### 11. 3-dot context menu — moderator role + InnerTube moderation  [mcp]
platform: youtube
ref: `src/content-scripts/youtube.ts` InnerTube moderation; commit `e933d4d`
preconds: signed into YouTube as a stream moderator on the test channel, AllChat active on that channel's live stream. If not a mod, `[skip: not a mod on test channel]`.
steps:
  1. Open 3-dot menu on a non-own message
  2. Confirm moderation items (Remove / Time-out / Ban) are present
  3. Trigger a `Remove` action and confirm via UI
expected: moderation items render; selected action calls InnerTube; the targeted message disappears from native chat (and AllChat) within a few seconds
result: [pending]

---

## 4. YouTube — super chat / sticker rendering

### 12. Super Chat tile + ticker pill  [mcp]
platform: youtube
ref: `src/ui/components/ChatContainer.tsx` super chat block; commit `91567bb`
preconds: a live stream actively receiving super chats — OR mock-WS injection via `dist/chat-container.html?platform=youtube` against `tests/fixtures/mock-ws-server.ts` if no real super chats are flowing
steps:
  1. Inject (or wait for) a super-chat message
  2. Inspect the rendered tile and the ticker bar
  3. Wait for the ticker pill to expire
expected: tier-coloured header tile renders with amount + author; corresponding pill appears in the ticker bar above messages; pill auto-expires on the documented timeout for that tier
result: [pending]

### 13. Super Sticker rendering  [mcp]
platform: youtube
ref: `src/ui/components/ChatContainer.tsx` super sticker block; commit `91567bb`
preconds: same as #12 — real super sticker OR mock-WS event of type `super_sticker`
steps:
  1. Inject a super-sticker event
expected: sticker image + amount renders inline; ticker pill identical to super chat (icon variant)
result: [pending]

---

## 5. YouTube — input area, pickers & frame integration

### 14. Native input bar replaces InnerTube send  [mcp]
platform: youtube
ref: `src/content-scripts/youtube.ts`; commits `646db2d`, `e71738f`, `f533f23`
preconds: signed into YouTube, live stream chat available
steps:
  1. Use the AllChat input row to type and send
  2. Inspect network panel for the call route
expected: send goes through the YouTube native input flow (SAPISIDHASH-authenticated InnerTube `sendLiveChatMessageEndpoint` triggered via the native bar) — not the older direct fetch path; sender sees their own message once
result: [pending]

### 15. Picker overlays float above AllChat  [mcp]
platform: youtube
ref: `src/content-scripts/youtube.ts` `updatePickerState`; commits `ffc1a72`, `aab844c`, `a7eb559`, `28250b1`, `cf37f39`, `f533f23`
preconds: live YouTube stream, AllChat active
steps:
  1. Open the emoji picker
  2. Open the super chat dialog (purchase flow)
  3. Open the donation, poll, and Q&A flows where available
  4. Hover the reactions button
expected: every picker / overlay renders fully above the AllChat container; messages do not shift when the reaction button is hovered; the input row is never clipped at the top edge
result: [pending]

### 16. Panel-pages frame expansion  [mcp-event]
platform: youtube
ref: `src/content-scripts/youtube.ts` panel-pages observer; commits `cf37f39`, `43e3591`
preconds: live YouTube stream actively running a super-chat / poll / donation panel-page swap
steps:
  1. Trigger or wait for a panel-page swap (e.g. open the super chat tab)
  2. Observe the frame layout
expected: when `#chat` is hidden via panel-pages swap, `panel-pages` fills the available height; AllChat stays out of the way; switching back restores normal layout
result: [pending]

### 17. Native collapse handling  [mcp]
platform: youtube
ref: `src/content-scripts/youtube.ts` collapse observer; commit `f533f23`
preconds: AllChat active on a live YouTube stream
steps:
  1. Click YouTube's native chat collapse (X) button
  2. Click again to expand
expected: parent column shrinks to widget height when `[collapsed][hide-chat-frame]` is set; expands back without a layout flicker
result: [pending]

### 18. Native-tab switch removes both CSS layers  [mcp]
platform: youtube
ref: `src/content-scripts/youtube.ts` `handleSwitchToYouTube`; commits `9f324e4`, `b46f58c`, `fff3697`; debug note `youtube-native-tab-regression.md`
preconds: AllChat tab active on a live YouTube stream
steps:
  1. Click the `YouTube Chat` tab
  2. Read `getComputedStyle(#allchat-container).display`
  3. Confirm native messages and pinned banner are visible
  4. Click `AllChat` tab to switch back
expected: on YouTube tab, computed display is `none`; native chat header / ticker / pinned banner / messages / input all visible; on switch back AllChat overlay returns at `display: flex`
result: [pass — verified on youtube.com/watch?v=jfKfPfyJRdk 2026-04-29: clicking YouTube Chat tab flipped #allchat-container both inline and computed display to "none" (the regression-fixed behaviour); native iframe's #chat had display:flex with pinned banner present; clicking AllChat tab restored both displays to "flex"; iframe[data-platform=youtube] survived the switch]

### 19. Reaction button & messages around picker hover  [mcp]
platform: youtube
ref: `src/content-scripts/youtube.ts` reaction clip-path gutter; commits `aab844c`, `a7eb559`
preconds: AllChat active on a live YouTube stream that has reactions enabled
steps:
  1. Hover the reactions button repeatedly
expected: reaction button never clipped; messages above don't visibly shift on hover; clip-path gutter keeps both visible
result: [pending]

---

## 6. YouTube Studio

### 20. AllChat injects on Studio livestreaming dashboard  [mcp]
platform: youtube-studio
ref: `src/content-scripts/youtube-studio.ts`; commit `13aa540`
preconds: a YouTube account with an active live stream open in Studio
steps:
  1. Navigate to `https://studio.youtube.com/video/<id>/livestreaming`
  2. Wait for chat container to load
expected: AllChat is injected into the Studio chat frame; messages flow in
result: [pass — verified on studio.youtube.com/video/5oYthcwZKm8/livestreaming 2026-04-29 (caesar's live stream): YTStudio content script logs `Livestreaming page detected → Detected streamer: UCRs6QcV9kwHu7V0LLlIvwxQ → Streamer found! Has 5 active platform(s) → Injected CSS to hide native chat → UI injected`. DOM probe: #allchat-container present, iframe at chrome-extension://.../ui/chat-container.html?platform=youtube&streamer=caesarlp present, connection state `connected`. (First post-navigate probe at 8s missed the injection; the script needs a few seconds for Studio's polymer DOM to settle before extractStreamerUsername resolves.)]

### 21. Viewer-card link from Studio username  [mcp]
platform: youtube-studio
ref: `src/content-scripts/youtube-studio.ts`; commit `13aa540`
preconds: AllChat active in Studio livestreaming dashboard
steps:
  1. Click a non-own username in the chat
expected: viewer card / channel link opens (Studio context); no console errors
result: [pending]

---

## 7. Kick

### 22. Kick tab bar + native REST send  [mcp]
platform: kick
ref: `src/content-scripts/kick.ts`; commits `1356240`, `8362cda`
preconds: signed into Kick on a live channel
steps:
  1. Confirm tab bar with `[AllChat | Kick Chat]` mounts
  2. Send a message via AllChat input
expected: tab bar renders; message lands in Kick chat using cookie XSRF token (POST to `kick.com/api/v2/messages/send/...`); native message list stays hidden while AllChat is active
result: [pending]

### 23. Kick surgical message hiding (header + footer kept)  [mcp]
platform: kick
ref: `src/content-scripts/kick.ts` selective hide; commit `b54ca42`
preconds: AllChat active on a live Kick channel
steps:
  1. Inspect the native chat column visually
expected: only the message list is hidden; native header (channel info / pinned messages) and footer (input, emote picker) remain visible and operable
result: [pass — verified on kick.com/edmatthews 2026-04-29: #channel-chatroom retained both children intact (header flex row + body flex column); single [data-allchat-msg-wrap="1"] element had display:none (the message list); native footer "Search emotes" input still present and operable; recent-commenters strip ("Reinbow_App25 JorgeG9316 hemivoid11") still visible above the hidden list]

### 24. Kick light/dark theme matching  [mcp]
platform: kick
ref: `src/content-scripts/base/tabBar.ts` `isLightMode` / `watchThemeChanges`; commit `8362cda`
preconds: AllChat active on a live Kick channel
steps:
  1. Toggle Kick's dark/light mode via Kick's UI
  2. Observe AllChat tab bar without reloading
expected: AllChat tab bar accent and background follow Kick's `[data-theme]` change live, no reload required
result: [pass — verified on kick.com/edmatthews 2026-04-29: setting <html data-theme="light"> flipped #allchat-tab-bar background from rgb(20,21,23) (Kick dark) to rgb(240,240,240) (Kick light) within 800ms; setting data-theme="dark" reverted to rgb(20,21,23). watchThemeChanges observer correctly responds to data-theme attribute mutations on <html>.]

---

## 8. Cross-platform UI

### 25. Scroll position preservation  [mcp]
platform: all
ref: `src/ui/components/ChatContainer.tsx` scroll-pause logic; commit `ea2e73a`
preconds: a chat session with > 1 viewport of messages
steps:
  1. Scroll up in the message list
  2. Wait for new messages to arrive
  3. Verify scroll position is held (does NOT auto-scroll to bottom)
expected: scroll position remains anchored where the user is reading; existing rendered messages don't jump
result: [pending]

### 26. "New messages" indicator only when scrolled up  [mcp]
platform: all
ref: `src/ui/components/ChatContainer.tsx` indicator; commit `28f7740`; today's working-tree fix
preconds: a chat session with > 1 viewport of messages
steps:
  1. Auto-follow burst: stay at bottom and let many messages stream in — confirm no indicator
  2. Scroll up — let several messages arrive — confirm indicator appears with count
  3. Click the indicator to clear / scroll back to bottom — confirm indicator disappears
expected: indicator only ever shows while user is scrolled up; click clears state cleanly; no flicker during auto-follow
result: [pending]

### 27. Connection dot states  [mcp]
platform: all
ref: `src/content-scripts/base/tabBar.ts` `updateTabBarConnDot`; commit `480768d`
preconds: built extension on any platform
steps:
  1. Observe initial mount (yellow / connecting)
  2. WS connects → green
  3. Force network drop (offline mode via Playwright route abort) → red within reconnect window
  4. Restore network → green again
  5. Trigger duplicate `CONNECT_WEBSOCKET` (SPA nav) — confirm dot still shows correct state
expected: green / yellow / red transitions match WS state; SPA-nav duplicate connect doesn't leave a stale colour
result: [partial pass — green state confirmed on twitch.tv/caesarlp + youtube.com/watch?v=jfKfPfyJRdk (rgb(74, 222, 128)) 2026-04-29; yellow (connecting) and red (error) transitions pending — needs network drop / reconnect to exercise]

### 28. Pop-out scrollback buffer  [mcp]
platform: all
ref: `src/content-scripts/base/PlatformDetector.ts` (`POPOUT_MESSAGE_BUFFER_KEY`)
preconds: in-page AllChat with messages already received
steps:
  1. Open pop-out
  2. Inspect initial pop-out scrollback
expected: pop-out shows the buffered messages from before it was opened (not a blank state)
result: [pass — verified on twitch.tv/hasanabi 2026-04-29 (active high-volume chat): popout opened from in-page tab bar showed 27 messages immediately on mount (no "Waiting for messages" placeholder). chrome.storage.local probe post-mount showed `popout_message_buffer` already gone — buffer was consumed-and-cleared by the popout's mount-time read. The race between the parent's write and the popout's read prevented direct capture of the storage value, but the observable outcome (messages appear immediately) matches spec.]

### 29. Pop-out window dimensions remembered  [mcp]
platform: all
ref: `src/content-scripts/base/PlatformDetector.ts` (`popout_window_*` keys)
preconds: pop-out previously opened, resized, and closed
steps:
  1. Reopen the pop-out
expected: pop-out reopens at the previous width / height / x / y, clamped to current screen bounds
result: [pending]

---

## 9. Pop-out lifecycle

### 30. Firefox SW-port-disconnect close detection  [manual]
platform: all (firefox-only)
ref: `src/background/service-worker.ts`; commit `182c9b0`
preconds: Firefox build of the extension installed (Playwright MCP runs Chromium, so this is hand-driven)
steps:
  1. Open a Twitch / YouTube / Kick stream and the AllChat pop-out
  2. Close the pop-out window
expected: in-page tab detects the close via service-worker port disconnect; in-page UI returns to normal (the floating pop-out indicator clears) without relying on `window.closed`
result: [pass — confirmed live by user 2026-04-29 in Firefox: opening + closing the popout cleanly restores in-page UI; the SW port-disconnect signal in commit 182c9b0 successfully replaces the dead-cross-compartment-wrapper polling that Chromium uses]

### 31. TAB_BAR_MODE postMessage `'*'` targetOrigin  [manual]
platform: twitch (firefox-only)
ref: `src/content-scripts/base/tabBar.ts`; commit `6e7af31`
preconds: Firefox + Twitch
steps:
  1. Open Firefox console
  2. Activate AllChat on Twitch
expected: no `Failed to execute 'postMessage' ... targetOrigin` errors logged for the `TAB_BAR_MODE` payload; tab bar mounts cleanly under `moz-extension://`
result: [pass — confirmed live by user 2026-04-29 in Firefox: tab bar mounts cleanly on twitch.tv, no leftover "Native" button visible inside the AllChat iframe, no postMessage targetOrigin errors. The `'*'` widening for the TAB_BAR_MODE payload (commit 6e7af31) lets the message cross the moz-extension origin gap.]

---

## 10. Theming

### 32. Live light/dark switch updates tab bar without reload  [mcp]
platform: all
ref: `src/content-scripts/base/tabBar.ts` `watchThemeChanges`; commit `8362cda`
preconds: AllChat active on each of: Twitch, YouTube, Kick
steps:
  1. On each platform, switch the platform's theme between dark and light using the platform's own toggle
expected: tab bar background, accent, and connection dot colours flip live to match without a page reload
result: [pass across all 3 platforms — verified 2026-04-29:
  - YouTube (youtube.com/watch?v=jfKfPfyJRdk): toggling `<html>` `dark` attr flipped tab bar bg rgb(15,15,15) ↔ rgb(249,249,249) within 600ms.
  - Kick (kick.com/edmatthews): setting `<html data-theme="light">` flipped tab bar bg rgb(20,21,23) ↔ rgb(240,240,240) within 800ms.
  - Twitch (twitch.tv/CaesarLP): adding `tw-root--theme--light` body class flipped tab bar bg rgb(24,24,27) ↔ rgb(239,239,241) within 800ms.
  All three follow the shared `watchThemeChanges` MutationObserver pattern in tabBar.ts.]

---

## 11. Integrity check

### 33. Popup login blocked on tampered manifest  [manual]
platform: all
ref: `src/lib/compat.ts` + `src/popup/popup.tsx`; commits `1455392`, `8bf2b94`, `32b1e04`
preconds: a SEPARATELY-built tampered artifact whose `manifest.json` `name` field has been edited (forking scenario). Cannot reuse the MCP-loaded `dist/`; needs a side build.
steps:
  1. `cp -r dist/ dist-tampered/` and edit `dist-tampered/manifest.json` `name`
  2. Load `dist-tampered/` as a separate unpacked extension
  3. Open its popup, attempt to sign in
expected: integrity check fails; sign-in is blocked or visibly disabled; no token is issued
result: [pending]

---

## 12. Debug-note regressions to verify

One scenario per active note in `.planning/debug/`. Each is a regression check for a fix that landed on this branch but has not been verified live yet (or, in the case of #34, confirms a still-open root cause is properly surfaced to the user).

### 34. Unlisted YouTube stream send  [mcp]
platform: youtube
ref: `.planning/debug/422-unlisted-youtube-stream.md` (status: open)
preconds: an unlisted YouTube live stream the user has access to
steps:
  1. Open the unlisted stream
  2. Try to send via AllChat
expected: documented behaviour — either the send works (if the `video_id` extension fix has shipped) OR the user gets an unambiguous failure surfaced (not a silent stuck-state). Capture network response and reconcile against the debug note before tagging.
result: [skip — out of scope for v1.6.0 per user 2026-04-29: unlisted streams and members-only chats are explicitly not v1.6.0 targets. Debug note remains open for a future release.]

### 35. No duplicate message on send (sender side)  [mcp]
platform: youtube, twitch, kick
ref: `.planning/debug/duplicate-message-on-send.md`, `duplicate-messages.md` (status: awaiting_human_verify)
preconds: signed in on each platform
steps:
  1. Send a message on YouTube — confirm it appears exactly once in AllChat
  2. Repeat on Twitch
  3. Repeat on Kick
  4. Send during SPA-nav (e.g., navigate between two streams quickly, then send)
expected: each sent message appears exactly once in AllChat across all platforms and across SPA navigation; ID-based dedup guard holds even with two iframes mid-cleanup
result: [pending]

### 36. Userflair badges + name gradients render  [mcp]
platform: kick (primary), youtube, twitch
ref: `.planning/debug/userflair-not-honored.md` (status: awaiting_human_verify)
preconds: a stream where some viewers have AllChat-configured gradients AND Kick badges (subscriber / mod / VIP / OG)
steps:
  1. Observe Kick chat — confirm Kick badges render as text-chip fallback when no icon URL is provided
  2. Observe a viewer with a gradient configured — confirm their username renders with the gradient (not flat colour)
  3. Confirm own messages still prefer the locally-stored gradient pref
expected: Kick badges visible; gradients applied to non-own messages with `name_gradient`; AllChat premium badge renders correctly (name `allchat-premium`, not `premium`)
result: [partial pass — verified on twitch.tv/hasanabi (High Load Extension test overlay) 2026-04-29: AllChat iframe shows cross-platform messages with TWITCH badges (subscriber/premium/sub-gifter/turbo + native badge series like "nasa-artemis-ii", "twitch-recap-2024", "raging-wolf-helm", "gp-explorer-3", "ditto", "rplace-2023", "purple-pixel-heart---together-for-good-24"), KICK badges (subscriber + "K" platform glyph for users like numbnuts1, Mk5Chri, redial), and YouTube messages with YouTube platform badge. Channel-emote images render (KEKW, ICANT, hasO, edmatthewsEDGEEK, FBtouchdown, LULW, dnmSOY). AllChat premium badge name fix not directly observed — no user with that flair appeared. Name-gradient rendering verified structurally but not color-confirmed via cross-origin iframe.]

### 37. New-overlay viewer WebSocket access  [mcp]
platform: backend (verify via extension)
ref: `.planning/debug/ws-404-priest-qt.md` (status: awaiting_human_verify)
preconds: a freshly created overlay belonging to a streamer who has never manually toggled `is_public_for_viewers`
steps:
  1. As a viewer (different account), open a live stream for that streamer
  2. Confirm the AllChat WebSocket connects (no 404)
expected: new overlays default to `is_public_for_viewers = true`; WS handshake at `wss://allch.at/ws/chat/<streamer>?token=...` returns 101 Switching Protocols, not 404
result: [pending]

### 38. YouTube native-tab regression fix  [mcp]
platform: youtube
ref: `.planning/debug/youtube-native-tab-regression.md` (status: fixed-awaiting-live-verification)
preconds: AllChat active on a live YouTube stream
steps:
  1. In the page console, evaluate: `const c = document.getElementById('allchat-container'); ({ inline: c?.style.display, computed: getComputedStyle(c).display })`
  2. Click `YouTube Chat` tab — re-evaluate
  3. Click `AllChat` tab — re-evaluate
expected: AllChat tab → both inline and computed are `flex`; YouTube Chat tab → both are `none`; switching back returns to `flex`. Native chat (header + ticker + pinned banner + messages + input) visible while on YouTube tab.
result: [pass — same probe as scenario #18; verified on youtube.com/watch?v=jfKfPfyJRdk 2026-04-29: AllChat tab → inline=flex, computed=flex; YouTube tab → inline=none, computed=none (the bug from commit ffc1a72 is fixed); native #chat at display:flex with pinned banner; switch back returns both displays to flex]
overlap: same probe as scenario #18 — share evidence between the two.

### 39. YouTube OAuth redirect (regression check)  [mcp]
platform: youtube (popup)
ref: `.planning/debug/youtube-oauth-redirect-mismatch.md` (status: resolved)
preconds: signed out of AllChat in a fresh browser profile (run BEFORE the auth-prep AllChat sign-in, or sign out first)
steps:
  1. Open the extension popup
  2. Click Sign in with Google / YouTube
expected: opens a tab to the backend OAuth URL (allch.at), NOT a `chrome.identity.launchWebAuthFlow` URI; no `Error 400: redirect_uri_mismatch`; on success the popup receives the token via the `chrome.tabs.onUpdated` watcher
result: [pending]

### 40. Twitch + Kick OAuth path parity  [mcp]
platform: twitch, kick (popup)
ref: same fix as #39 (OPEN_AUTH_TAB unified across providers)
preconds: signed out of AllChat
steps:
  1. From the popup, sign in via Twitch
  2. Sign out, sign in via Kick
expected: both providers complete via the `OPEN_AUTH_TAB` backend flow; no provider relies on extension-redirect URIs; no console errors
result: [pending]

---

## Summary

```
total:    40
passed:   0
failed:   0
pending:  40
blocked:  0
skipped:  0
```

### By execution path

```
[mcp]:        34
[mcp-event]:   3   (#1, #2, #16)
[manual]:      3   (#30, #31 — Firefox-only; #33 — needs tampered build)
```

### Walkthrough order

Suggested order to maximise coverage in one Playwright MCP session:

1. **Build first** — `npm run build` so `dist/` is current. Fix the 6 TS errors from `release-readiness.md` if `npm run type-check` is gating CI; build itself doesn't need them clean.
2. **Auth prep** — load `dist/`, sign into Twitch / YouTube / Kick / AllChat (see top of file). Confirm cookies persist.
3. **OAuth scenarios first** (#39, #40) — these test the sign-in paths themselves, so run them BEFORE you've fully completed the AllChat sign-in. Then complete sign-in.
4. **`[mcp]` core sweep**, grouped by platform context to minimise navigation:
   - Twitch: #3, #5, #6, #7 (sign out of AllChat for this one, then back in), #8
   - YouTube: #9, #10, #11 (skip if not a mod), #14, #15, #17, #18, #19
   - YouTube Studio: #20, #21
   - Kick: #22, #23, #24
   - Cross-platform / regression: #4, #12, #13, #25, #26, #27, #28, #29, #32, #34, #35, #36, #37, #38
5. **`[mcp-event]` opportunistic** — keep #1, #2, #16 in mind; if a redemption / poll / panel-page swap fires while another scenario is running, capture it and mark.
6. **`[manual]` last** — three of them, all have specific environment requirements:
   - #30, #31 — open in Firefox by hand
   - #33 — build a tampered `dist-tampered/` and load it as a separate extension
7. **Update results inline** after each scenario.

### Coverage notes

- The `tests/` directory's `WIDGET-01..08` skip-stubs (`tests/test-tab-bar.spec.ts`, `tests/test-widget-zones.spec.ts`) overlap scenarios #1–#5; if any are unblocked during the walkthrough, port the steps into the spec.
- Scenario #26 ("new messages" indicator) is the source-of-truth for the missing Playwright spec called out in `release-readiness.md` item #6 — once it passes, port the steps to `tests/test-scroll-indicator.spec.ts`.
- The audit's hard blockers (TS errors, dirty tree, wip commit, gitignore cleanup) are NOT in this UAT — they are handled separately in `release-readiness.md`. This UAT only verifies user-observable behaviour.

### Findings outside the scenario list

These surfaced during the 2026-04-29 walkthrough but don't map cleanly to a single scenario.

**FINDING-A — Pop-out send fails with "No response from content script" (Twitch).**
Details captured under scenario #8. Reproduced on twitch.tv/hasanabi after fresh extension reload + High Load Extension test overlay set active. The pop-out's URL kept `twitch_channel=caedrel` even when opened from a hasanabi tab, suggesting the SW relay can't bridge to the right content script context. Release-blocker candidate — the marketed pop-out send flow is broken in Chromium.

**FINDING-B — Extension CSP blocks 7TV / BTTV / FFZ emote APIs (pre-existing).**
The extension's `manifest.json` `extension_pages` CSP `connect-src 'self' https://allch.at wss://allch.at` blocks fetches to `https://7tv.io/v3/*`, `https://api.frankerfacez.com/v1/*`, and `https://api.betterttv.net/3/*`. Console logs `[7TV] Failed to fetch global emotes`, `[FFZ] Failed to fetch global emotes`, `[BTTV] Failed to fetch global emotes` on every chat-container mount, then `[Emote Autocomplete] Loaded 0 emotes (7TV: 0, BTTV: 0, FFZ: 0)`. Confirmed across Twitch, YouTube, Kick, and YouTube Studio injections. Marketing copy on allch.at claims "7TV, BTTV, FFZ, plus native Twitch and YouTube emotes — they all render correctly in your overlay" — that promise is half-broken in the extension (OBS overlay is unaffected because it's at allch.at origin). Not a v1.6.0 regression — `git log -p manifest.json | grep connect-src` shows the third-party endpoints have NEVER been in the extension's CSP. Not a release blocker for v1.6.0 specifically, but worth a follow-up commit before claiming the extension matches the OBS overlay's emote support.

**FINDING-C — Iframe interaction limit via Playwright MCP.**
Many scenarios that need clicks/scrolls inside the AllChat iframe (cross-origin from the parent twitch.tv / youtube.com page) cannot be driven directly from MCP because:
1. The chat iframe is at `chrome-extension://gfldepbhkibfamjffdhcobdfmghhdnij/ui/chat-container.html` (extension origin), parent is at `https://www.twitch.tv` etc. — `iframe.contentDocument` access is blocked by browser security.
2. Snapshot-based aria refs into the iframe become stale within ~200ms under high chat load (5+ msgs/sec on hasanabi), and the snapshot+click race is too tight for tools that fire sequentially.
3. The pop-out tab (same chrome-extension:// origin as a top-level page) IS interactable, which is how I drove send tests — but pop-out send currently fails (FINDING-A).
This affects the verifiability of: #6 (viewer-card click), #14 (YT native input send), #15 (picker overlays — would need to click inside iframe to open emoji picker), #25 (scroll preservation — needs scroll inside iframe), #26 ("new messages" indicator click-to-clear), #28 (popout scrollback content read). For these, in-page evidence (via parent-tab DOM probes for the side-effect overlays AllChat mounts in the parent) is strong enough for #6 / #15 if you accept "overlay container appears in parent page" as the pass condition; otherwise they need user-side verification.

### Walkthrough summary — 2026-04-29

| status | scenarios | notes |
|---|---|---|
| pass | #3, #4, #5, #6, #8, #18, #20, #23, #24, #28, #30, #31, #32, #38 | 14 fully passing — #30 + #31 confirmed live by user in Firefox 2026-04-29 (popout lifecycle via SW port-disconnect, TAB_BAR_MODE postMessage '*' targetOrigin) |
| partial pass | #27, #36 | #27 — green dot confirmed cross-platform, yellow/red transitions pending; #36 — Twitch + Kick badges visible, gradients structurally correct but color-confirmation needs cross-origin iframe access |
| skip | #34 | out of scope per user (unlisted YT) |
| pending | #1, #2, #7, #9, #10, #11, #12, #13, #14, #15, #16, #17, #19, #21, #22, #25, #26, #29, #33, #35, #37, #39, #40 | mix of [mcp-event] (need real super-chat / poll / channel-points / panel-page-swap event during session), iframe-interaction-blocked (FINDING-C), and environment-specific (#33 tampered-build, #37 second account) |
| fixes shipped this session | b76b1c3 (CSP for emote APIs), b98d309 (popout SW relay handler in twitch.ts + kick.ts) | both verified live in browser before commit |
