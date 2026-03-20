# YouTube Agent Scenario

**Requirement:** TEST-05 (at least one LLM-agent scenario per platform)
**Execution:** Claude MCP browser session with extension loaded in Chromium

## Prerequisites

- Playwright MCP browser with extension loaded (dist/ directory)
- A live YouTube stream URL with the video ID
- Extension must be configured for the streamer

## Steps

1. Navigate to `https://www.youtube.com/watch?v={videoId}` where the video is a live stream
2. Wait up to 15 seconds for the page to fully load (YouTube SPA takes longer)
3. Assert: `ytd-live-chat-frame` is hidden — either `style#allchat-hide-native-style` is present in `<head>` or `ytd-live-chat-frame` has `display:none`
4. Assert: `#allchat-container` element exists in the page (positioned in the same flex slot as the hidden native chat)
5. Assert: `iframe[data-platform="youtube"]` element is present inside `#allchat-container`
6. Assert: the iframe is visible (non-zero dimensions)
7. Inside the iframe (using frameLocator): assert the chat messages area is visible
8. Inside the iframe: assert the platform badge or accent color indicates YouTube (#FF4444 or "youtube" label)
9. Inside the iframe: locate the chat input field
10. Type "test message from Claude agent" into the chat input
11. Assert: the typed text appears in the input field

## Success Criteria

- Native YouTube chat is hidden via injected style tag (not inline style, per INJ-06)
- AllChat iframe is visible in the same flex slot as the hidden native chat
- Platform badge reflects YouTube identity
- Chat input accepts keyboard input

## Notes

- SPA navigation: after the initial load, navigating to another YouTube video should re-inject
- If the stream ends, teardown should remove #allchat-container and restore native chat visibility
- Agent tests are manual MCP sessions — not run in CI
