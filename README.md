# All-Chat Browser Extension

Replace native platform chat with All-Chat's unified chat experience.

[![Build Status](https://github.com/caesarakalaeii/all-chat-extension/workflows/Build%20and%20Release/badge.svg)](https://github.com/caesarakalaeii/all-chat-extension/actions)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ioneembbnocfljgbhgfknbbnpfeadacm)](https://chromewebstore.google.com/detail/all-chat-extension/ioneembbnocfljgbhgfknbbnpfeadacm)
[![Firefox Add-on](https://img.shields.io/amo/v/all-chat-extension)](https://addons.mozilla.org/en-US/firefox/addon/all-chat-extension/)

## Features

- **Multi-platform support** — Twitch, YouTube, YouTube Studio, Kick
- **Real-time messaging** — WebSocket connection for instant messages
- **OAuth authentication** — Log in with Twitch to send messages
- **Viewer identity** — Avatars, name gradients, avatar frames, and flair from your All-Chat profile
- **Rich message display** — Emotes, badges, and user colors
- **Badge system** — All-Chat, premium, moderator, VIP, and subscriber badges in correct order
- **Emote autocomplete** — Type `:` to autocomplete 7TV, BTTV, and FFZ emotes (global + channel-specific)
- **Smart reconnection** — Auto-reconnect with visual countdown timer
- **Inline send feedback** — Visual confirmation directly in the input field
- **Rate limiting** — 20 messages/min, 100/hour with visual feedback

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
2. Visit a supported platform (Twitch, YouTube, Kick) where the streamer uses All-Chat
3. The native chat is replaced with the All-Chat overlay
4. Click "Login with Twitch" to send messages
5. Type `:` to autocomplete emotes from 7TV, BTTV, and FFZ

### Connection States

- **Connected** — Receiving messages in real-time
- **Connecting/Reconnecting** — Establishing connection (shows countdown)
- **Failed** — Connection failed after 10 attempts (click reload)
- **Disconnected** — Not connected to chat

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

**Made with ❤️ by the All-Chat team**
