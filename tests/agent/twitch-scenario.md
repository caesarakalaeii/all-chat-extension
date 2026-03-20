# Twitch Agent Scenario

**Requirement:** TEST-05 (at least one LLM-agent scenario per platform)
**Execution:** Claude MCP browser session with extension loaded in Chromium

## Prerequisites

- Playwright MCP browser with extension loaded (dist/ directory)
- A live Twitch stream URL (or a known-live channel)
- Extension must be configured for the streamer (they exist in allch.at database)

## Steps

1. Navigate to `https://www.twitch.tv/{streamer}` where {streamer} is a live, configured channel
2. Wait up to 10 seconds for `[AllChat twitch] Initializing...` to appear in the browser console
3. Assert: `#allchat-container` element exists inside `.chat-shell` on the page
4. Assert: `iframe[data-platform="twitch"]` element is present inside `#allchat-container`
5. Assert: the iframe is visible (not zero-size, not display:none)
6. Assert: no element with `position: fixed` and id `allchat-container` exists (INJ-02)
7. Inside the iframe (using frameLocator): assert the chat messages area is visible
8. Inside the iframe: assert the platform badge or accent color indicates Twitch (#A37BFF or "twitch" label)
9. Inside the iframe: locate the chat input field
10. Type "test message from Claude agent" into the chat input
11. Assert: the typed text appears in the input field value

## Success Criteria

- AllChat iframe is visible in the native .chat-shell slot, not as a fixed overlay
- Platform badge reflects Twitch identity
- Chat input accepts keyboard input
- No JavaScript errors thrown during the session

## Notes

- If the channel is not live, the extension may show a "not configured" badge instead
- Use `https://www.twitch.tv/` + a known-live streamer configured in allch.at
- Agent tests are manual MCP sessions — not run in CI (see CONTEXT.md: TEST-07 dropped)
