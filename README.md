# All-Chat Browser Extension

Replace native platform chat with All-Chat's unified chat experience.

[![Build Status](https://github.com/caesarakalaeii/all-chat-extension/workflows/Build%20and%20Release/badge.svg)](https://github.com/caesarakalaeii/all-chat-extension/actions)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

## ✨ Features

- 🎮 **Multi-platform support**: Works on Twitch, YouTube, and Kick
- 🔀 **Per-platform enable/disable**: Independently toggle AllChat on Twitch, YouTube, and Kick from the popup — native chat shown on disabled platforms
- 💬 **Real-time messaging**: WebSocket connection for instant messages
- 🔐 **OAuth authentication**: Log in with Twitch to send messages
- 🎭 **Rich message display**: Emotes, badges, and user colors
- 🔄 **Smart reconnection**: Auto-reconnect with visual countdown timer
- 🔔 **Toast notifications**: Success/error feedback for all actions
- ⚡ **Rate limiting**: 20 messages/min, 100/hour with visual feedback
- 🛡️ **Badge display**: Moderator, VIP, subscriber badges in correct order
- 🎨 **User colors**: Username colors match platform themes
- 🎯 **Emote autocomplete**: Type `:` to autocomplete 7TV, BTTV, and FFZ emotes

## 📦 Installation

### Browser Support
- ✅ **Chrome** 88+ (Fully supported)
- ✅ **Edge** 88+ (Fully supported)
- ✅ **Firefox** 109+ (Fully supported - see [Firefox guide](FIREFOX_INSTALLATION.md))
- ⚠️ **Brave** (Should work, untested)
- ⚠️ **Opera** (Should work, untested)

### Option 1: Download from Releases (Recommended)

1. **Download the latest release:**
   - Visit the [Releases page](https://github.com/caesarakalaeii/all-chat-extension/releases/latest)
   - Download `allchat-extension.zip`
   - Unzip the file to a folder

2. **Install in Chrome/Edge:**
   - Open your browser and go to:
     - Chrome: `chrome://extensions/`
     - Edge: `edge://extensions/`
   - Enable **"Developer mode"** (toggle in top-right corner)
   - Click **"Load unpacked"**
   - Select the unzipped folder

3. **Install in Firefox:**
   - See detailed [Firefox Installation Guide](FIREFOX_INSTALLATION.md)
   - Quick: Navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `manifest.json` from unzipped folder

4. **Requirements:**
   - Chrome 88+ / Edge 88+ / Firefox 109+
   - Extension automatically connects to `https://allch.at` (no setup needed!)

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/caesarakalaeii/all-chat-extension.git
cd all-chat-extension

# Install dependencies
npm install

# Build the extension
npm run build

# The built extension is in the dist/ folder
```

Then follow step 2 above, but select the `dist/` folder.

## 🚀 Usage

### First Time Setup

1. **Start All-Chat Services:**
   ```bash
   cd /path/to/all-chat
   make docker-up
   ```

2. **Visit a Twitch Stream:**
   - Go to any Twitch channel where the streamer is using All-Chat
   - The native Twitch chat will be replaced with All-Chat

3. **Manage Platform Settings:**
   - Click the extension icon to open the popup
   - Three per-platform toggles let you independently enable or disable AllChat on Twitch, YouTube, and Kick
   - Changes take effect immediately without reloading the page

4. **Login to Send Messages:**
   - Click "Login with Twitch" at the bottom of the chat
   - Complete OAuth authentication in the popup
   - Your username will appear in the header
   - Type a message and click Send!

### Connection States

- 🟢 **Connected**: Receiving messages in real-time
- 🟡 **Connecting/Reconnecting**: Establishing connection (shows countdown)
- 🔴 **Failed**: Connection failed after 10 attempts (click reload)
- ⚪ **Disconnected**: Not connected to chat

### Features Tour

**Viewing Messages:**
- See all messages with emotes rendered as images
- Moderator/VIP/subscriber badges displayed
- Username colors match Twitch theme
- Messages auto-scroll to bottom

**Sending Messages:**
- Must be logged in with Twitch
- 500 character limit
- Rate limits: 20 messages/minute, 100/hour
- Toast notification on success
- Error messages for failures
- **Emote autocomplete**: Type `:` followed by emote name to see suggestions (↑/↓ to navigate, Enter to select)

**Autocomplete Features:**
- Supports 7TV, BTTV, and FFZ emotes
- Shows both global and channel-specific emotes
- Keyboard navigation with arrow keys
- Mouse selection by clicking
- See [AUTOCOMPLETE_USER_GUIDE.md](AUTOCOMPLETE_USER_GUIDE.md) for details

**Reconnection:**
- Automatic reconnection on disconnect
- Visual countdown timer (e.g., "Reconnecting (5s)")
- Shows attempt progress (e.g., "[3/10]")
- Reload button if all attempts fail

## 📝 Releasing a New Version

### Automated Release with GitHub Actions

1. **Update the version** in `manifest.json`:
   ```json
   {
     "version": "1.0.1"
   }
   ```

2. **Commit and create a tag:**
   ```bash
   git add manifest.json
   git commit -m "chore: bump version to 1.0.1"
   git tag v1.0.1
   git push origin main
   git push origin v1.0.1
   ```

3. **GitHub Actions will automatically:**
   - Build the extension
   - Run type checks
   - Create a GitHub Release with the ZIP attached
   - Generate release notes

### Manual Release

```bash
npm run package
# Upload allchat-extension.zip to GitHub Releases manually
```

## 🛠️ Development

### Scripts

```bash
npm run dev          # Development build with watch mode
npm run build        # Production build
npm run type-check   # TypeScript validation
npm run lint         # ESLint
npm run package      # Create distributable ZIP
```

### Project Structure

```
all-chat-extension/
├── .github/
│   └── workflows/
│       └── build-and-release.yml  # CI/CD automation
├── src/
│   ├── background/
│   │   └── service-worker.ts      # WebSocket, API proxy, connection mgmt
│   ├── content-scripts/
│   │   ├── base/
│   │   │   └── PlatformDetector.ts  # Abstract base class
│   │   ├── twitch.ts               # Twitch integration ✅
│   │   └── youtube.ts              # YouTube integration (basic)
│   ├── ui/
│   │   ├── components/
│   │   │   ├── ChatContainer.tsx   # Main chat UI
│   │   │   ├── LoginPrompt.tsx     # OAuth login
│   │   │   ├── MessageInput.tsx    # Message sending
│   │   │   ├── Autocomplete.tsx    # Emote autocomplete dropdown
│   │   │   └── Toast.tsx           # Notifications
│   │   ├── index.tsx
│   │   └── styles.css              # Tailwind + animations
│   ├── lib/
│   │   ├── types/
│   │   │   ├── message.ts          # ChatMessage types
│   │   │   ├── extension.ts        # Extension types
│   │   │   └── viewer.ts           # Viewer auth types
│   │   ├── emoteAutocomplete.ts    # Multi-provider emote fetching
│   │   ├── renderMessage.tsx       # Emote rendering
│   │   ├── twitchBadges.ts         # Badge fetching
│   │   ├── badgeOrder.ts           # Badge sorting
│   │   └── storage.ts              # Chrome storage wrapper
│   └── popup/
│       ├── popup.html
│       └── popup.tsx               # Extension popup
├── dist/                           # Build output (git-ignored)
├── assets/                         # Extension icons
├── manifest.json                   # Chrome Extension Manifest v3
├── webpack.config.js               # Build configuration
├── tailwind.config.js              # Tailwind CSS config
├── tsconfig.json                   # TypeScript config
└── package.json
```

### Adding a New Platform

1. Create `src/content-scripts/platform-name.ts`
2. Extend `PlatformDetector` base class
3. Implement `detect()`, `injectUI()`, `getUsername()`
4. Add to `webpack.config.js` entry points
5. Add to `manifest.json` content_scripts

See `twitch.ts` for a complete example.

## 🔗 Related Projects

- **[All-Chat](https://github.com/caesarakalaeii/all-chat)** - Main backend services
- **[All-Chat Frontend](https://github.com/caesarakalaeii/all-chat/tree/main/frontend)** - Web overlay interface

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run type-check` and `npm run lint`
5. Submit a pull request

## 📚 Documentation

- **[AUTOCOMPLETE_USER_GUIDE.md](AUTOCOMPLETE_USER_GUIDE.md)** - Guide to using emote autocomplete
- **[CHECKPOINT.md](CHECKPOINT.md)** - Development progress and current status
- **[TESTING.md](TESTING.md)** - Testing instructions and scenarios
- **[Implementation Plan](https://github.com/caesarakalaeii/all-chat-extension/blob/main/.claude/plans/unified-launching-aho.md)** - Original 6-week roadmap

## 🐛 Known Issues

- YouTube username extraction may fail on some channel formats
- YouTube/Kick OAuth not yet tested (only Twitch fully implemented)
- Firefox support requires Manifest V2 port (planned for Phase 4)

## 💬 Support

For issues, questions, or feature requests:
- Open an [issue](https://github.com/caesarakalaeii/all-chat-extension/issues)
- See the main [All-Chat documentation](https://github.com/caesarakalaeii/all-chat)

---

**Made with ❤️ by the All-Chat team**
