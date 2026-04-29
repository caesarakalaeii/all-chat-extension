# All-Chat Browser Extension

**One chat for every stream.** This extension replaces native Twitch, YouTube, and Kick chat with [All-Chat](https://allch.at) — so you see messages from every platform the streamer broadcasts to.

Part of [All-Chat](https://allch.at) — the free, open-source multi-platform chat overlay for streamers.

[![Build Status](https://github.com/caesarakalaeii/all-chat-extension/workflows/Build%20and%20Release/badge.svg)](https://github.com/caesarakalaeii/all-chat-extension/actions)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ioneembbnocfljgbhgfknbbnpfeadacm)](https://chromewebstore.google.com/detail/all-chat-extension/ioneembbnocfljgbhgfknbbnpfeadacm)
[![Firefox Add-on](https://img.shields.io/amo/v/all-chat-extension)](https://addons.mozilla.org/en-US/firefox/addon/all-chat-extension/)

<p align="center">
  <img src="assets/screenshot-twitch.png" alt="All-Chat extension replacing native Twitch chat" width="600" />
</p>

## Features

- **Every platform in one chat** — Twitch, YouTube, YouTube Studio, and Kick chat unified in a single panel
- **Toggle per site** — Enable or disable All-Chat independently on each platform from the popup
- **Messages appear instantly** — Real-time delivery via WebSocket, no polling delay
- **Send with your existing account** — Log in with Twitch, YouTube, or Kick — no extra accounts needed
- **Your identity carries over** — Avatars, name gradients, avatar frames, and flair from your All-Chat profile
- **Full emote support** — Emotes, badges, and user colors render correctly across platforms
- **Emote autocomplete** — Type `:` to search 7TV, BTTV, and FFZ emotes (global + channel-specific)
- **Never miss a message** — Auto-reconnects with a visual countdown if your connection drops
- **Visual send feedback** — Confirmation appears directly in the input field when your message is sent
- **Rate limiting with feedback** — 20 messages/min, 100/hour with clear visual indicators

### Twitch: Tab Bar and Native Widgets

On Twitch, All-Chat adds a persistent tab bar at the top of the chat area with two tabs: **[∞ AllChat]** and **[Twitch Chat]**. A connection status dot next to the AllChat label shows your live connection state.

- **Tab switching** — Click either tab to instantly toggle between All-Chat (cross-platform messages from all connected platforms) and native Twitch chat. The tab bar stays visible at all times — you are always one click from switching back.
- **Interactive widgets** — Channel points, predictions, polls, hype trains, and raid banners appear alongside All-Chat when the AllChat tab is active. Clicking them — claiming channel points, voting on a prediction — triggers the real Twitch action. You lose no Twitch interactivity while using All-Chat.
- **Pop-out mode** — A pop-out button in the chat area opens All-Chat in a standalone window (useful for OBS or multi-monitor setups). Closing the pop-out restores the in-page chat.

## Installation

### Install from Store (Recommended)

- **Chrome / Edge / Brave:** [Chrome Web Store](https://chromewebstore.google.com/detail/all-chat-extension/ioneembbnocfljgbhgfknbbnpfeadacm)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/all-chat-extension/)

### Browser Support

- **Chrome** 88+
- **Edge** 88+
- **Firefox** 115+
- **Brave** (should work via Chrome Web Store)
- **Opera** (should work via Chrome Web Store)

### Build from Source

```bash
git clone https://github.com/caesarakalaeii/all-chat-extension.git
cd all-chat-extension
npm install
npm run build
```

Then load the `dist/` folder as an unpacked extension:
- Chrome: `chrome://extensions/` → Enable Developer mode → Load unpacked
- Edge: `edge://extensions/` → Enable Developer mode → Load unpacked
- Firefox: See [Firefox Installation Guide](FIREFOX_INSTALLATION.md)

## Usage

1. Install the extension from the store links above
2. Visit any Twitch, YouTube, or Kick stream where All-Chat sources are set up
3. Native chat is automatically replaced with the All-Chat feed
4. Click the extension icon to toggle All-Chat on or off per platform
5. Sign in to send messages with your existing platform account
6. Type `:` to autocomplete emotes from 7TV, BTTV, and FFZ

### Connection States

- **Connected** — Receiving messages in real-time
- **Connecting/Reconnecting** — Establishing connection (shows countdown)
- **Failed** — Connection failed after 10 attempts (click reload)
- **Disconnected** — Not connected to chat

### Notes

- **YouTube**: Only public, currently live streams are supported. Unlisted, private, and scheduled streams do not work — stream discovery relies on YouTube's public search API.

## Development

### Scripts

```bash
npm run dev          # Development build with watch mode
npm run build        # Production build
npm run type-check   # TypeScript validation
npm run lint         # ESLint
npm run test         # Playwright E2E tests
npm run test:agent   # Agent-tagged tests
npm run package      # Create distributable ZIP
```

### Project Structure

```
all-chat-extension/
├── .github/workflows/          # CI/CD automation
├── src/
│   ├── background/
│   │   └── service-worker.ts   # WebSocket, API proxy, connection mgmt
│   ├── content-scripts/
│   │   ├── base/
│   │   │   └── PlatformDetector.ts
│   │   ├── twitch.ts
│   │   ├── youtube.ts
│   │   ├── youtube-studio.ts
│   │   └── kick.ts
│   ├── ui/
│   │   ├── components/
│   │   │   ├── ChatContainer.tsx    # Main chat UI
│   │   │   ├── MessageInput.tsx     # Message input + inline feedback
│   │   │   ├── Autocomplete.tsx     # Emote autocomplete dropdown
│   │   │   ├── LoginPrompt.tsx      # OAuth login
│   │   │   ├── UserAvatar.tsx       # User profile pictures
│   │   │   ├── AllChatBadge.tsx     # All-Chat badge
│   │   │   ├── PremiumBadge.tsx     # Premium badge
│   │   │   ├── Toast.tsx            # Notifications
│   │   │   ├── ErrorDisplay.tsx     # Error rendering
│   │   │   ├── ErrorBoundary.tsx    # React error boundary
│   │   │   └── InfinityLogo.tsx     # Logo component
│   │   ├── index.tsx
│   │   └── styles.css
│   ├── lib/
│   │   ├── types/
│   │   │   ├── message.ts
│   │   │   ├── extension.ts
│   │   │   ├── viewer.ts
│   │   │   └── errors.ts
│   │   ├── emoteAutocomplete.ts
│   │   ├── renderMessage.tsx
│   │   ├── twitchBadges.ts
│   │   ├── badgeOrder.ts
│   │   ├── errorParser.ts
│   │   ├── errorMessages.ts
│   │   └── storage.ts
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.tsx
│   └── config.ts
├── tests/                      # Playwright E2E test suite
├── assets/                     # Extension icons
├── manifest.json               # Manifest V3
├── webpack.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

### Adding a New Platform

1. Create `src/content-scripts/platform-name.ts`
2. Extend `PlatformDetector` base class
3. Implement `detect()`, `injectUI()`, `getUsername()`
4. Add to `webpack.config.js` entry points
5. Add to `manifest.json` content_scripts

See `twitch.ts` for a complete example.

## Releasing a New Version

1. Update `version` in `manifest.json`
2. Commit, tag, and push:
   ```bash
   git tag v1.x.x
   git push origin main --tags
   ```
3. GitHub Actions builds, type-checks, and creates a release with the ZIP attached

## Related Projects

- **[All-Chat](https://github.com/caesarakalaeii/all-chat)** — Main backend services
- **[All-Chat Frontend](https://github.com/caesarakalaeii/all-chat/tree/main/frontend)** — Web overlay interface

## Documentation

- [Autocomplete User Guide](AUTOCOMPLETE_USER_GUIDE.md)
- [Firefox Installation Guide](FIREFOX_INSTALLATION.md)
- [Firefox Compatibility](FIREFOX_COMPATIBILITY.md)
- [API Configuration](API_CONFIGURATION.md)
- [Testing Quick Start](TESTING_QUICK_START.md)
- [Testing](TESTING.md)

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Run `npm run type-check` and `npm run lint`
4. Submit a pull request

## Support

For issues, questions, or feature requests:
- Open an [issue](https://github.com/caesarakalaeii/all-chat-extension/issues)
- See the main [All-Chat documentation](https://github.com/caesarakalaeii/all-chat)

---

**Free. Open source. Built for streamers who refuse to pick just one platform.**
