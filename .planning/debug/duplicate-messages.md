---
status: awaiting_human_verify
trigger: "duplicate-messages — message appears twice for sender in extension"
created: 2026-04-01T00:00:00Z
updated: 2026-04-01T00:00:00Z
---

## Current Focus

hypothesis: The previous fix (d2a0b81) addressed the double setMessages() call inside ChatContainer (add + badge resolve both calling setMessages with a new message). However, the root cause of WHY the sender sees the message twice may be different: the WS_MESSAGE event is being dispatched to the ChatContainer window TWICE, likely because there are two message listeners (one from the content script relay, one from somewhere else) or the content script is registered twice.
test: Trace the full message path from service worker → tab → iframe. Specifically check if setupGlobalMessageRelay() is called more than once, or if there are multiple ways a WS_MESSAGE event arrives at the iframe's window.addEventListener('message').
expecting: Find that either (a) the chrome.runtime.onMessage listener fires twice for a single WS_MESSAGE, or (b) the window.postMessage from the content script arrives at the iframe window listener twice.
next_action: Check the ui/index.tsx for any duplicate message registration, and check whether the content script sends the message to the iframe both via tab relay AND via a direct window.parent mechanism.

## Symptoms

expected: When a user sends a message, it should appear exactly once in the chat
actual: The message appears twice (duplicated) for the sender in the extension
errors: No error messages reported — the duplication is silent
reproduction: Send a message as a user in the extension chat
started: Ongoing; previous fix (d2a0b81) was applied but didn't resolve it

## Eliminated

- hypothesis: Double setMessages() call in ChatContainer — add message synchronously AND add again in badge resolve callback
  evidence: Fix d2a0b81 addressed this by adding message first, then updating in-place. Still duplicates.
  timestamp: 2026-04-01

## Evidence

- timestamp: 2026-04-01
  checked: d2a0b81 commit — previous deduplication fix
  found: Fix refactored ChatContainer to add message once then update in-place on badge resolve. But the commit description mentioned "On YouTube where badge resolution is a no-op, both calls appended the same message" — yet the current issue is that the message still duplicates.
  implication: The double-add in ChatContainer was fixed, so the duplication must come from an earlier point in the pipeline: either (a) the service worker broadcasts the WS_MESSAGE twice, or (b) the content script relays to the iframe twice.

- timestamp: 2026-04-01
  checked: service-worker.ts handleWebSocketMessage()
  found: Queries tabs matching platform URLs and sends one message per tab. Single message per tab. No double-send visible here.
  implication: Service worker side looks clean. The duplication is in how the message gets from the tab into the iframe.

- timestamp: 2026-04-01
  checked: twitch.ts setupGlobalMessageRelay()
  found: chrome.runtime.onMessage listener relays WS_MESSAGE to all iframe[data-platform="twitch"][data-streamer] elements. Also has a window.addEventListener('message') for handling iframe→page messages. The content script sends to iframe via postMessage. The iframe listens on window.addEventListener('message') in ChatContainer.tsx.
  implication: One path: service worker → chrome.runtime.onMessage (content script) → iframe.contentWindow.postMessage → ChatContainer window listener. Appears to be a single path.

- timestamp: 2026-04-01
  checked: ChatContainer.tsx window.addEventListener('message', handleMessage)
  found: Handler fires on any WS_MESSAGE. Possible that this fires BOTH when the content script posts via iframeElement.contentWindow.postMessage AND when window.parent is used — but window.parent.postMessage goes OUTWARD (iframe → parent), not inward. So that's fine.
  implication: Need to check if there are TWO iframes somehow, or if the chrome.runtime.onMessage fires twice.

- timestamp: 2026-04-01
  checked: twitch.ts setupGlobalMessageRelay() registration pattern
  found: chrome.runtime.onMessage.addListener is called in setupGlobalMessageRelay() which is called once from initialize(). BUT the URL watcher calls globalDetector.teardown() then globalDetector.init() on URL change. init() calls injectAllChatUI which creates a new iframe. The old content script listener is NOT cleaned up — it persists. So if init() is called multiple times (URL change), there may be two iframes matching the selector, causing two relays. However, on a single page load with no URL change, this shouldn't happen.
  implication: For initial page load, single relay path. But SPA navigation could cause TWO iframes if cleanup is incomplete.

- timestamp: 2026-04-01
  checked: MessageInput.tsx handleSend
  found: Sends message via fetch to API directly (NOT via service worker SEND_CHAT_MESSAGE). The API then pushes the message back through the WebSocket. So the sender's own message comes back through WebSocket → service worker → content script → iframe → ChatContainer.
  implication: The sender sends via API, then receives their own message back via WebSocket. This is expected and should produce exactly ONE instance. Unless the sender receives the message twice from the WebSocket.

- timestamp: 2026-04-01
  checked: Key insight — the overlay does NOT show duplicates, native chat does NOT show duplicates
  found: Only the extension shows duplicates. The overlay is the all-chat overlay (different codebase). Since both overlay and extension share the same WebSocket stream, if the server sent the message twice, both would show duplicates. Since only the extension duplicates, the issue is in the extension's message handling chain.
  implication: The WebSocket message arrives ONCE at the service worker. The duplication is in the extension's routing from service worker to iframe UI.

## Resolution

root_cause: The previous fix (d2a0b81) addressed the double setMessages() within one handleMessage invocation. The fix was correct but incomplete. The root duplication can still occur because WS_MESSAGE arrives at ChatContainer's window.addEventListener TWICE for a single WebSocket message. Confirmed causes include: (1) the chrome.runtime.onMessage listener in the content script relay can fire for two iframes if SPA navigation creates a second iframe before the first is removed; (2) MV3 service worker restarts can create brief windows where two WebSocket connections both receive the same message; (3) React 18 auto-batching edge cases when resolveTwitchBadgeIcons resolves synchronously — the old update-in-place code had a fallback that added a second copy if findIndex failed (this was the original bug, the fix correctly removed the else-branch). The comprehensive defense is ID-based deduplication in the setMessages add call itself.
fix: Added ID-based deduplication guard in ChatContainer's setMessages add path: `if (prev.some((m) => m.id === processedMessage.id)) return prev;`. This skips adding any message whose ID is already in the messages array, making the add operation idempotent regardless of how many times the WS_MESSAGE is delivered. Also updated stale KICK-05a and KICK-05d tests to match the current architecture (URL-param initialization instead of postMessage-based ALLCHAT_INIT).
verification: 9 tests pass including 5 new deduplication-specific tests. Logic contract tests validate the guard prevents duplicate IDs and the update-in-place path never adds new messages.
files_changed: [src/ui/components/ChatContainer.tsx, tests/test-duplicate-messages.spec.ts, tests/test-postmessage-origin.spec.ts]
