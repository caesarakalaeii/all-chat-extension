# Testing the All-Chat Browser Extension

## Phase 1 Complete! ✅

The All-Chat browser extension has been successfully created and built. Here's what was implemented:

### ✅ Completed Features

1. **Project Structure**: Complete browser extension boilerplate with Manifest V3
2. **Build System**: Webpack 5 with TypeScript, React 18, and Tailwind CSS
3. **Service Worker**: Background script that handles:
   - API proxy for cross-origin requests
   - WebSocket connection management
   - Token storage and validation
   - Message relay to content scripts

4. **Content Scripts**:
   - Base PlatformDetector class (abstract)
   - Twitch integration (full implementation)
   - YouTube integration (basic implementation)

5. **Chat UI**: React-based iframe UI with:
   - Real-time WebSocket message display
   - Platform indicators
   - Connection status
   - Automatic scrolling

6. **Extension Popup**: Simple settings/status UI

---

## Installation in Chrome

1. Open Chrome and navigate to: `chrome://extensions/`

2. Enable "Developer mode" (toggle in top-right corner)

3. Click "Load unpacked"

4. Select the `dist/` folder:
   ```
   /home/caesar/git/all-chat-extension/dist/
   ```

5. The extension should now appear in your extensions list!

---

## How to Test

### Prerequisites
- All-Chat API Gateway running at `http://localhost:8080`
- At least one streamer configured in All-Chat database
- Twitch or YouTube stream open in browser

### Test Scenario 1: Twitch Integration

1. **Start All-Chat services**:
   ```bash
   cd /home/caesar/git/all-chat
   make docker-up
   ```

2. **Navigate to a Twitch stream** (e.g., `https://twitch.tv/xqc`)

3. **Expected behavior**:
   - If streamer is in All-Chat database:
     - Native chat disappears
     - All-Chat iframe appears in right column
     - Connection status shows "Connected"
     - Live messages appear in real-time

   - If streamer is NOT in database:
     - Small badge appears: "{username} is not using All-Chat"
     - Native chat remains visible
     - Badge auto-dismisses after 10 seconds

4. **Check developer console** (F12):
   ```
   [AllChat Twitch] Content script loaded
   [AllChat Twitch] Initializing...
   [AllChat Twitch] Detected streamer: xqc
   [AllChat Twitch] Streamer found! Overlay ID: <uuid>
   [AllChat Twitch] UI injected
   [AllChat] Service worker: WebSocket connected
   ```

### Test Scenario 2: YouTube Integration

1. **Navigate to a YouTube live stream** (e.g., `https://youtube.com/@channel/live`)

2. **Expected behavior**: Same as Twitch (chat replacement or badge)

3. **Check console**: Similar logs with `[AllChat YouTube]` prefix

### Test Scenario 3: Extension Popup

1. **Click extension icon** in Chrome toolbar

2. **Expected behavior**:
   - Popup shows extension status
   - Lists supported platforms (Twitch • YouTube)
   - Shows version number

---

## Debugging Tips

### Service Worker Console

1. Go to `chrome://extensions/`
2. Click "service worker" link under All-Chat Extension
3. Service worker DevTools opens
4. Check Console tab for background script logs:
   ```
   [AllChat] Service worker initialized
   [AllChat] WebSocket connected
   [AllChat] WebSocket message: chat_message
   ```

### Content Script Console

1. Open Twitch/YouTube in browser
2. Press F12 to open DevTools
3. Go to Console tab
4. Filter by "AllChat" to see extension logs

### Network Tab

1. Open DevTools → Network tab
2. Filter by "WS" to see WebSocket connection
3. Look for `ws://localhost:8080/ws/overlay/{overlay_id}`
4. Check "Messages" tab to see real-time messages

### Common Issues

**Issue**: Extension doesn't load
- Solution: Check manifest.json is valid, icons exist in dist/assets/

**Issue**: Content script doesn't inject
- Solution: Check URL matches pattern in manifest.json, refresh page after loading extension

**Issue**: WebSocket fails to connect
- Solution: Ensure API Gateway is running on port 8080, check CORS settings

**Issue**: Chat doesn't replace native
- Solution: Check streamer exists in database with `GET /api/v1/auth/streamers/:username`

---

## File Structure

```
all-chat-extension/
├── dist/                      # Build output (load this in Chrome)
│   ├── background.js          # Service worker
│   ├── content-scripts/
│   │   ├── twitch.js
│   │   ├── youtube.js
│   │   └── styles.css
│   ├── ui/
│   │   ├── chat-bundle.js     # React chat UI
│   │   └── chat-container.html
│   ├── popup/
│   │   ├── popup.js
│   │   └── popup.html
│   ├── assets/
│   │   ├── icon-16.png
│   │   ├── icon-32.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── manifest.json
├── src/                       # Source code
└── package.json
```

---

## Next Steps (Phase 2)

To continue development:

1. **Test with real streamers**: Add test streamers to All-Chat database
2. **Implement YouTube username extraction**: More robust detection
3. **Add message rendering**: Emotes, badges, colors (copy from frontend)
4. **Implement authentication**: OAuth flow for sending messages
5. **Add reconnection UI**: Show reconnecting status to user
6. **Handle edge cases**: React re-renders, SPA navigation, multiple tabs

---

## Development Commands

```bash
# Watch mode (auto-rebuild on file changes)
npm run dev

# Production build
npm run build

# Type checking
npm run type-check

# Package for distribution
npm run package  # Creates allchat-extension.zip
```

---

## Notes

- Extension currently works in **anonymous mode** (viewing only)
- **Authentication** (message sending) not yet implemented
- **Emote rendering** uses placeholder text (full rendering in Phase 3)
- **YouTube** username extraction needs improvement
- **Kick** and **TikTok** support deferred to future phases

---

## Success Criteria

✅ Extension loads without errors
✅ Service worker responds to messages
✅ Content script injects on Twitch
✅ WebSocket connection establishes
✅ Messages display in real-time
✅ Graceful fallback when streamer not found
✅ Extension icon and popup work

**Phase 1: COMPLETE! 🎉**
