# All-Chat Browser Extension

Replace native platform chat with All-Chat's unified chat experience.

## Development

```bash
# Install dependencies
npm install

# Build extension (watch mode)
npm run dev

# Build for production
npm run build

# Package for Chrome Web Store
npm run package
```

## Installation (Development)

### Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder

### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `manifest.json` from `dist/` folder

## Project Structure

```
src/
├── background/           # Service worker (API proxy)
├── content-scripts/      # Platform-specific injection scripts
│   ├── base/            # Abstract base class
│   ├── twitch.ts        # Twitch integration
│   └── youtube.ts       # YouTube integration
├── ui/                  # React chat UI
├── lib/                 # Shared utilities and types
└── popup/               # Extension popup (settings)
```

## Features

- 🎮 Replace Twitch chat with All-Chat
- 📺 Replace YouTube live chat with All-Chat
- 🔄 Real-time WebSocket connection
- 🔐 Optional authentication (send messages)
- ✨ Support for 7TV, BTTV, FFZ emotes
- 🎨 Platform-colored messages
