# Directory Structure

## Layout

```
all-chat-extension/
├── src/
│   ├── background/
│   │   └── service-worker.ts         # Service worker — WebSocket, API proxy, token mgmt
│   ├── content-scripts/
│   │   ├── base/
│   │   │   └── PlatformDetector.ts   # Shared platform detection base
│   │   ├── twitch.ts                 # Twitch stream detection + UI injection
│   │   ├── youtube.ts                # YouTube stream detection + UI injection
│   │   └── styles.css                # Content script injected styles
│   ├── lib/
│   │   ├── types/
│   │   │   ├── errors.ts             # Typed error variants
│   │   │   ├── extension.ts          # ExtensionMessage discriminated union
│   │   │   ├── message.ts            # ChatMessage, WebSocketMessage types
│   │   │   └── viewer.ts             # ViewerInfo type
│   │   ├── badgeOrder.ts             # Badge display priority logic
│   │   ├── emoteAutocomplete.ts      # Autocomplete engine
│   │   ├── errorMessages.ts          # User-facing error string map
│   │   ├── errorParser.ts            # Type-guard error parsing
│   │   ├── renderMessage.tsx         # Message rendering with emote substitution
│   │   ├── storage.ts                # Chrome storage helpers
│   │   └── twitchBadges.ts           # Twitch badge fetching and caching
│   ├── ui/
│   │   ├── components/
│   │   │   ├── Autocomplete.tsx      # Emote/mention autocomplete dropdown
│   │   │   ├── ChatContainer.tsx     # Root chat component (state, message list)
│   │   │   ├── ErrorDisplay.tsx      # Connection/auth error rendering
│   │   │   ├── LoginPrompt.tsx       # OAuth login trigger UI
│   │   │   ├── MessageInput.tsx      # Chat input with rate-limit handling
│   │   │   └── Toast.tsx             # Transient notifications
│   │   ├── chat-container.html       # iframe entry point HTML
│   │   ├── index.tsx                 # React root (mounts ChatContainer)
│   │   └── styles.css                # UI-specific styles
│   ├── popup/
│   │   ├── popup.html                # Extension popup HTML
│   │   └── popup.tsx                 # Popup component (auth status, settings)
│   ├── config.ts                     # Runtime config (API URL, feature flags)
│   └── env.d.ts                      # TypeScript env declarations
├── tests/
│   ├── test-container-cleanup.spec.ts  # Regression: no duplicate UI containers
│   └── test-streamer-switch.spec.ts    # E2E: streamer switch with screenshots
├── .planning/
│   └── codebase/                     # This codebase map
├── manifest.json                     # Extension manifest v3
├── package.json                      # Node dependencies
├── tsconfig.json                     # TypeScript config (strict mode)
├── playwright.config.ts              # Playwright test config
└── vite.config.ts (or webpack)       # Build configuration
```

## Key Locations

| What | Where |
|------|-------|
| Extension manifest | `manifest.json` |
| WebSocket + API logic | `src/background/service-worker.ts` |
| YouTube integration | `src/content-scripts/youtube.ts` |
| Twitch integration | `src/content-scripts/twitch.ts` |
| Shared types | `src/lib/types/` |
| Chrome storage helpers | `src/lib/storage.ts` |
| React chat UI entry | `src/ui/index.tsx` |
| Chat root component | `src/ui/components/ChatContainer.tsx` |
| Error handling | `src/lib/errorParser.ts`, `src/lib/types/errors.ts` |
| Tests | `tests/` |
| API/WS config | `src/config.ts` |

## Where to Add New Code

| Task | Location |
|------|----------|
| New platform support | Add `src/content-scripts/{platform}.ts`, register in `manifest.json` |
| New UI component | `src/ui/components/` |
| New message type | `src/lib/types/message.ts` + handler in `service-worker.ts` |
| New background message type | `src/lib/types/extension.ts` + switch case in `service-worker.ts` |
| New storage key | `src/lib/storage.ts` |
| New error type | `src/lib/types/errors.ts` + message in `src/lib/errorMessages.ts` |
| New E2E test | `tests/` |

## Naming Conventions

| Type | Convention |
|------|------------|
| TypeScript files | `camelCase.ts` |
| React components | `PascalCase.tsx` |
| Type files | `camelCase.ts` in `types/` |
| Test files | `test-{feature}.spec.ts` |
| HTML templates | `{name}.html` |
| CSS files | `styles.css` (co-located with their scope) |
