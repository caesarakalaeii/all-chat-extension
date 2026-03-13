# Kick Agent Scenario

**Requirement:** TEST-05 (at least one LLM-agent scenario per platform)
**Execution:** Claude MCP browser session with extension loaded in Chromium

## Prerequisites

- Playwright MCP browser with extension loaded (dist/ directory)
- A live Kick stream URL (e.g., https://kick.com/{streamer} on a live channel)
- Extension must be configured for the streamer

## Steps

1. Navigate to `https://kick.com/{streamer}` where {streamer} is a live, configured channel
2. Wait up to 15 seconds for `[AllChat kick] Initializing...` in browser console
3. Assert: extension detected live stream — `PlatformDetector.isLiveStream()` returned true (evidenced by `#allchat-container` appearing)
4. Assert: `#allchat-container` element exists inside `#channel-chatroom`
5. Assert: `iframe[data-platform="kick"]` element is present inside `#allchat-container`
6. Assert: native Kick chat children are hidden (`style#allchat-hide-native-style` present)
7. Inside the iframe (using frameLocator): assert the chat messages area is visible
8. Inside the iframe: assert the platform badge or accent color indicates Kick (#53FC18 or "kick" label)
9. Inside the iframe: locate the chat input field
10. Type "test message from Claude agent" into the chat input
11. Assert: the typed text appears in the input field

## Success Criteria

- AllChat iframe is visible in the #channel-chatroom slot
- Native Kick chat is hidden
- Platform badge reflects Kick identity
- Chat input accepts keyboard input

## Notes

- Kick selectors: primary `#channel-chatroom`, fallback `#chatroom`, fallback `.chatroom-wrapper`
- SPA navigation: navigating from one Kick stream to another should re-inject correctly
- If the channel is offline, isLiveStream() returns false and the extension does not inject
- Agent tests are manual MCP sessions — not run in CI
