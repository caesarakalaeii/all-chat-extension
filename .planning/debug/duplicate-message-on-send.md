---
status: awaiting_human_verify
trigger: "Sending a message through the extension causes the message to appear twice in the extension's chat UI"
created: 2026-04-01T00:00:00Z
updated: 2026-04-01T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — two setMessages() appends per WS event due to separate synchronous + async paths
test: Fix applied and build verified
expecting: Human confirmation that message appears once after sending
next_action: Await user verification

## Symptoms

expected: When a user sends a message, it should appear exactly once in the extension's chat message list.
actual: The sent message appears twice in the extension's chat list. The duplicate only shows inside the extension UI — the overlay/platform chat shows the message once correctly.
errors: No error messages reported.
reproduction: Send a message through the extension on YouTube. The message shows up twice in the extension chat.
started: Unknown when it started. Only tested on YouTube so far.

## Eliminated

(none — root cause found on first hypothesis)

## Evidence

- timestamp: 2026-04-01T00:00:00Z
  checked: ChatContainer.tsx lines 179-206 (chat_message handler)
  found: |
    Two separate setMessages() calls are made for every incoming chat_message WebSocket event:
    
    Call 1 (lines 187-199, async): Inside resolveTwitchBadgeIcons().then() — upsert logic
    (replace-if-found, else append). Because the promise resolves asynchronously, when it fires
    the message may or may not already be in state.
    
    Call 2 (lines 202-206, synchronous): Immediately after launching the async call — unconditionally
    appends processedMessage with no deduplication.
    
    Race condition: if resolveTwitchBadgeIcons resolves fast enough (e.g. for non-Twitch messages
    where the function returns quickly), both calls see existingIndex === -1 and both append,
    producing a duplicate in a single render cycle. On YouTube, Twitch badge resolution is a no-op
    and resolves synchronously/immediately — triggering the race every time.
  implication: Root cause confirmed — two setMessages appends per event

- timestamp: 2026-04-01T00:00:00Z
  checked: Build output after fix
  found: "webpack 5.105.4 compiled successfully in 3265 ms"
  implication: Fix compiles cleanly

## Resolution

root_cause: |
  In ChatContainer.tsx, the chat_message WebSocket handler made two separate setMessages() calls
  per event:
  1. Synchronous immediate append (old lines 202-206): added processedMessage unconditionally
  2. Async append-or-replace inside resolveTwitchBadgeIcons().then() (old lines 187-199): also
     appended when existingIndex === -1

  On YouTube (where Twitch badge resolution is a no-op and resolves synchronously), the async
  .then() fires before the synchronous call's state update has been committed, so both see no
  existing entry for that message ID and both append — causing a visible duplicate every time.
fix: |
  Restructured the handler to add the message exactly once (synchronously, immediately) then
  update it in-place when badge resolution completes. Removed the redundant second append.
  The async path now only ever replaces an existing entry, never appends.
verification: Build passes. Awaiting human test on YouTube.
files_changed:
  - src/ui/components/ChatContainer.tsx
