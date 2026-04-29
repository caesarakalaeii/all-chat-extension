---
status: awaiting_human_verify
trigger: "userflair-not-honored — Extension doesn't honor/display userflairs set by viewers"
created: 2026-04-02T00:00:00Z
updated: 2026-04-02T01:00:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED (gradient sub-bug)
test: Build succeeded; awaiting manual verification — username should render as gradient for users who have configured one in All-Chat
expecting: Usernames with a configured gradient show the gradient; solid-color-only users still show their color; own messages still prefer locally-stored pref
next_action: Human verify in live stream chat with a viewer who has a gradient configured

## Symptoms

expected: Viewer userflairs (colored names/icons indicating flair status) should be displayed next to usernames in the extension's chat UI, matching how they appear in native platform chats.
actual: Userflairs are completely absent in the extension's chat across all platforms (Twitch, YouTube, Kick).
errors: None — no crashes or error messages, just missing visual flair.
reproduction: Open any stream chat in the extension — viewer names lack any flair indicators.
started: Never worked — this feature has never been implemented.

## Eliminated

- hypothesis: Flair data is absent from the backend schema
  evidence: backend models/message.go has UserInfo with Badges []Badge; kick_normalizer.go extracts KickSenderIdentity.Badges into models.Badge entries; the data flows through the full pipeline
  timestamp: 2026-04-02

- hypothesis: The extension doesn't receive flair data at all
  evidence: ChatContainer.tsx receives the full ChatMessage including message.user.badges; the badges array IS populated for Kick messages with Type/Text values
  timestamp: 2026-04-02

## Evidence

- timestamp: 2026-04-02
  checked: services/message-processor/models/message.go
  found: UserInfo has Badges []Badge{Name, Version, IconURL}; also has AvatarFlairURL/AvatarFrameURL which are All-Chat cosmetics (unrelated to platform flairs)
  implication: Badge data structure exists and flows through

- timestamp: 2026-04-02
  checked: services/kick-listener/websocket/types.go + cmd/main.go
  found: KickSenderIdentity.Badges []KickBadge{Type, Text} captured in tags; kick_normalizer.go converts to Badge{Name: badge.Type, Version: badge.Text, IconURL: ""}
  implication: Kick badge data is present but has empty IconURL because Kick has no public badge CDN

- timestamp: 2026-04-02
  checked: src/ui/components/ChatContainer.tsx lines 455-469
  found: Badge rendering only shows a badge if badge.name === 'allchat' OR badge.name === 'premium' OR badge.icon_url is truthy. Falls through to null otherwise.
  implication: All Kick badges (subscriber, moderator, vip, og, etc.) are silently dropped because they have no icon_url

- timestamp: 2026-04-02
  checked: Twitch normalizer + badgeOrder.ts
  found: Twitch badges also have empty icon_url from normalizer (enriched later via resolveTwitchBadgeIcons). YouTube badges have inline SVG data URIs as icon_url.
  implication: Twitch badges work because resolveTwitchBadgeIcons fills the icon_url. YouTube badges work because they use data URIs. Kick badges never get an icon_url filled.

- timestamp: 2026-04-02
  checked: badge name check in ChatContainer vs enricher injection
  found: Enricher injects badge name 'allchat-premium' but ChatContainer checks for 'premium' — mismatch means All-Chat premium badge also never renders via PremiumBadge component (secondary bug)
  implication: Both Kick flairs AND All-Chat premium badge are invisible due to rendering gaps

- timestamp: 2026-04-02
  checked: webpack build after badge fix
  found: Build compiled successfully in 4372ms with no TypeScript errors
  implication: Badge fix is syntactically and type-safe correct

- timestamp: 2026-04-02
  checked: ChatContainer.tsx username rendering (lines 492-510)
  found: Gradient rendering gated entirely on `parsedGradient` (viewer's own locally-stored gradient) — `message.user.name_gradient` from the backend is never read or parsed for any other user
  implication: All registered viewers with a gradient configured in All-Chat show a flat color in the extension, despite the backend correctly populating `name_gradient` in every message

- timestamp: 2026-04-02
  checked: enricher/viewer_badge_enricher.go + models/message.go + message.ts
  found: Backend populates UserInfo.NameGradient (JSON string) for all registered viewers; extension type definition already includes `name_gradient?: string` on UserInfo — data is present at the component, just not used
  implication: Fix is purely in the frontend rendering path

- timestamp: 2026-04-02
  checked: webpack build after gradient fix
  found: Build compiled successfully in 4480ms with no TypeScript errors
  implication: Gradient fix is syntactically and type-safe correct

## Resolution

root_cause: (1) The extension's ChatContainer.tsx badge rendering silently dropped any badge that lacked an icon_url and didn't match the hardcoded 'allchat'/'premium' names. Kick badges never have icon URLs, so all Kick flairs/badges were invisible. (2) The All-Chat premium badge was injected with name 'allchat-premium' by the enricher but the UI checked for 'premium'. (3) Username gradient rendering only applied to the logged-in viewer's own messages (via locally-stored pref), completely ignoring the `name_gradient` field on `message.user` sent by the backend for all other registered viewers.

fix: (1) Added a text-chip fallback for badges without icon_url. (2) Fixed premium badge name check from 'premium' to 'allchat-premium'. (3) Updated badgeOrder.ts ROLE_PRIORITIES to use 'allchat-premium'. (4) Refactored ChatContainer.tsx username rendering to parse `message.user.name_gradient` for all non-own-message users — renders gradient text when present, falls back to flat color otherwise. Extracted `parseNameGradient` helper and `NameGradient` type for reuse.

verification: Build passes (4480ms, no TypeScript errors). Awaiting human verification in live stream chat.
files_changed: [src/ui/components/ChatContainer.tsx, src/lib/badgeOrder.ts]
