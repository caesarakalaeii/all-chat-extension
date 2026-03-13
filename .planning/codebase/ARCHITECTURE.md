# Architecture

## Pattern

**Browser Extension (Manifest V3)** — multi-layer architecture with a service worker hub, per-platform content scripts, and an iframe-sandboxed React UI.

```
┌─────────────────────────────────────────────────────────┐
│  YouTube / Twitch Tab                                     │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Content Script (platform-specific)                 │ │
│  │  - Detects live stream                              │ │
│  │  - Injects iframe into page DOM                     │ │
│  │  - Bridges messages: SW ↔ iframe (postMessage)      │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │ chrome.runtime.sendMessage      │
└─────────────────────────┼───────────────────────────────┘
                          │
         ┌────────────────▼────────────────┐
         │    Service Worker (background)   │
         │    - WebSocket connection mgmt   │
         │    - Token storage / validation  │
         │    - REST API proxy (CORS bypass)│
         │    - Broadcasts to all tabs      │
         └────────────────┬────────────────┘
                          │ WebSocket
         ┌────────────────▼────────────────┐
         │    allch.at API Gateway          │
         │    /ws/chat/{streamer}           │
         │    /api/v1/...                   │
         └─────────────────────────────────┘

  ┌────────────────────────────────────┐
  │  iframe (chat-container.html)      │
  │  React app (chat-bundle.js)        │
  │  - Renders chat messages           │
  │  - MessageInput + Autocomplete     │
  │  - ErrorDisplay, Toast, Login      │
  └────────────────────────────────────┘
```

## Layers

### 1. Service Worker (`src/background/service-worker.ts`)

The central hub. Responsibilities:
- Owns the single WebSocket connection to `allch.at`
- Manages reconnection with exponential backoff (max 10 attempts)
- Heartbeat ping every 30 seconds
- Proxies API calls from content scripts (bypasses CORS)
- JWT token storage and expiration validation
- Broadcasts messages to all tabs via `chrome.tabs.sendMessage`
- Sets extension badge to reflect connection state (✓/✗/!/empty)

### 2. Content Scripts (`src/content-scripts/`)

Per-platform scripts injected at `document_idle`:

| File | Platform | URL Match |
|------|----------|-----------|
| `twitch.ts` | Twitch | `https://www.twitch.tv/*` |
| `youtube.ts` | YouTube | `https://www.youtube.com/watch*`, `/live/*` |

Responsibilities:
- Detect live stream status (platform-specific DOM/API checks)
- Extract streamer handle/username
- Inject `<iframe>` pointing to `ui/chat-container.html`
- Relay messages: service worker → iframe via `window.postMessage`
- Clean up UI on stream end / navigation

### 3. React UI (`src/ui/`)

Loaded inside the iframe (sandboxed from page). Components:
- `ChatContainer.tsx` — root component, manages state
- `MessageInput.tsx` — text input with rate-limit awareness
- `Autocomplete.tsx` — emote and mention autocomplete
- `ErrorDisplay.tsx` — connection/auth errors
- `LoginPrompt.tsx` — OAuth login trigger
- `Toast.tsx` — transient notifications

### 4. Popup (`src/popup/popup.tsx`)

Extension action popup:
- Auth status (logged in / guest)
- Connection state display
- Settings access

### 5. Shared Library (`src/lib/`)

| File | Purpose |
|------|---------|
| `types/message.ts` | ChatMessage, WebSocketMessage types |
| `types/extension.ts` | ExtensionMessage discriminated union |
| `types/errors.ts` | Typed error variants |
| `types/viewer.ts` | ViewerInfo type |
| `storage.ts` | Chrome storage helpers (sync/local) |
| `errorParser.ts` | Type-guard error parsing |
| `renderMessage.tsx` | Message rendering with emote substitution |
| `emoteAutocomplete.ts` | Autocomplete engine |
| `twitchBadges.ts` | Badge fetching and caching |
| `badgeOrder.ts` | Badge display priority |
| `errorMessages.ts` | User-facing error strings |

## Data Flow

### Incoming messages (server → UI)

```
allch.at WebSocket
  → service worker onmessage
    → broadcastConnectionState / handleWebSocketMessage
      → chrome.tabs.sendMessage (type: 'WS_MESSAGE')
        → content script listener
          → iframe.contentWindow.postMessage
            → React UI state update → render
```

### Outgoing messages (user → server)

```
React MessageInput
  → window.parent.postMessage
    → content script listener
      → chrome.runtime.sendMessage (type: 'SEND_CHAT_MESSAGE')
        → service worker
          → POST /api/v1/auth/viewer/chat/send
```

### Connection management

```
content script detects stream
  → chrome.runtime.sendMessage (CONNECT_WEBSOCKET)
    → service worker connects WebSocket
      → on open: broadcast 'connected' state
      → on close: backoff reconnect OR broadcast 'failed'
```

## Key Design Decisions

- **Single WebSocket in service worker** — avoids per-tab connections, one source of truth
- **iframe sandbox** — React UI isolated from page DOM, no CSS conflicts
- **Discriminated union messages** — `ExtensionMessage` type ensures exhaustive handling
- **CORS proxy via service worker** — API calls routed through background to bypass content script restrictions
- **Platform-specific content scripts** — separate detection logic per platform, no shared code forced into one file

## Entry Points

| File | Role |
|------|------|
| `src/background/service-worker.ts` | Background service worker |
| `src/content-scripts/twitch.ts` | Twitch content script |
| `src/content-scripts/youtube.ts` | YouTube content script |
| `src/ui/index.tsx` | React UI root |
| `src/popup/popup.tsx` | Extension popup |
