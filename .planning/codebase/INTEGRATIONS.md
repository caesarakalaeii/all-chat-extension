# External Integrations

**Analysis Date:** 2026-03-12

## APIs & External Services

**All-Chat API Gateway:**
- Service: Custom unified chat API
- What it's used for: Central authentication, streamer info, chat message relay, WebSocket connections
- SDK/Client: Native fetch API with Bearer token authorization
- Auth: JWT token (viewer_jwt_token stored in Chrome local storage)
- Endpoints: `src/background/service-worker.ts`

**Twitch Platform:**
- Service: Live stream platform integration
- What it's used for: Stream detection, viewer authentication, chat integration
- Auth: OAuth 2.0 redirect flow via API gateway
- Endpoints:
  - `/api/v1/auth/viewer/twitch/login` - Initiate Twitch auth
  - `https://www.twitch.tv/*` - Host permission for content script injection

**YouTube Platform:**
- Service: Live stream platform integration
- What it's used for: Stream detection, viewer authentication, chat integration
- Auth: OAuth 2.0 redirect flow via API gateway
- Endpoints:
  - `/api/v1/auth/viewer/youtube/login` - Initiate YouTube auth
  - `https://www.youtube.com/watch*` - Host permission for content script injection
  - `https://www.youtube.com/live/*` - Host permission for live streams

**7TV Emote API:**
- Service: Third-party emote provider
- What it's used for: Emote autocomplete for chat input
- Client: Fetch API (no SDK)
- Base URL: `https://7tv.io/v3`
- CDN: `https://cdn.7tv.app/emote`
- Endpoints:
  - `/emote-sets/global` - Global emotes
  - `/users/twitch/{channelName}` - Channel-specific emotes
- Cache: 5 minutes in-memory

**BTTV (Better TTV) Emote API:**
- Service: Third-party emote provider
- What it's used for: Emote autocomplete for chat input
- Client: Fetch API (no SDK)
- Base URL: `https://api.betterttv.net/3/cached`
- CDN: `https://cdn.betterttv.net/emote`
- Endpoints:
  - `/emotes/global` - Global emotes
  - `/users/twitch/{channelName}` - Channel-specific emotes
- Cache: 5 minutes in-memory

**FFZ (FrankerFaceZ) Emote API:**
- Service: Third-party emote provider
- What it's used for: Emote autocomplete for chat input
- Client: Fetch API (no SDK)
- Base URL: `https://api.frankerfacez.com/v1`
- CDN: `https://cdn.frankerfacez.com`
- Endpoints:
  - `/set/global` - Global emotes
  - `/room/{channelName}` - Channel-specific emotes
- Cache: 5 minutes in-memory
- Security: URL validation for CDN domain (HTTPS only)

## Data Storage

**Databases:**
- None - Stateless extension architecture

**Local Storage:**
- Chrome Storage API (sync and local)
  - Sync storage: Extension preferences, API gateway URL, enabled state
  - Local storage: JWT tokens, viewer info, UI collapse state
  - Location: `src/lib/storage.ts`

**File Storage:**
- Local filesystem only - Extension assets bundled in dist/

**Caching:**
- In-memory cache for emotes (5-minute TTL)
- Location: `src/lib/emoteAutocomplete.ts`
- Reduces redundant API calls to 7TV, BTTV, FFZ

## Authentication & Identity

**Auth Provider:**
- Custom OAuth 2.0 via All-Chat API Gateway
- Twitch and YouTube supported

**Implementation:**
- Platform-specific OAuth redirect initiated by `/api/v1/auth/viewer/{platform}/login`
- JWT token stored in Chrome local storage after successful callback
- Token validation: JWT expiry check via base64 decoding (header.payload.signature)
- Location: `src/background/service-worker.ts` (ensureValidToken, initiateAuth)

**Storage:**
- `viewer_jwt_token` - JWT token in local storage
- `viewer_info` - User metadata {id, username, display_name, platform} in local storage
- Token refresh: Manual logout/re-auth (no silent refresh)

## Monitoring & Observability

**Error Tracking:**
- None detected - No external error tracking service

**Logs:**
- Console logging only (browser DevTools)
- Namespace prefixes: `[AllChat]`, `[Emote Autocomplete]`, `[7TV]`, `[BTTV]`, `[FFZ]`
- Location: Throughout `src/` with `console.log()` and `console.error()`

## CI/CD & Deployment

**Hosting:**
- Not applicable - Browser extension distribution
- Manual packaging: `npm run package` creates `allchat-extension.zip`

**CI Pipeline:**
- None detected - No CI configuration in repo

## Environment Configuration

**Required env vars:**
- `API_URL` - Base URL for All-Chat API
  - Production: `https://allch.at`
  - Development: `http://localhost:8080`
  - Set via webpack DefinePlugin at build time

**Secrets location:**
- JWT tokens in Chrome local storage (browser-managed)
- No .env file (secrets injected at build time via webpack)

## Webhooks & Callbacks

**Incoming:**
- Redirect callback from auth providers
- Handled by popup/extension UI during OAuth flow
- Location: `src/popup/popup.tsx` - POST to service worker with token via STORE_VIEWER_TOKEN message

**Outgoing:**
- WebSocket connection for real-time chat
- Location: `src/background/service-worker.ts` (connectWebSocket)
- Format: `ws://{apiUrl}/ws/chat/{streamerUsername}?token={jwtToken}`
- Messages: Chat updates from API pushed to UI via ExtensionMessage protocol

**Chat Message Submission:**
- HTTP POST to `/api/v1/auth/viewer/chat/send`
- Authorization: Bearer {jwtToken}
- Payload: {streamer_username, message}
- Location: `src/background/service-worker.ts` (sendChatMessage)

## Cross-Extension Communication

**Extension Message Protocol:**
- Location: `src/lib/types/extension.ts`
- Types: ExtensionMessage, ExtensionResponse
- Messages:
  - GET_STREAMER_INFO - Fetch streamer platforms and status
  - CONNECT_WEBSOCKET - Initiate WebSocket connection
  - DISCONNECT_WEBSOCKET - Teardown connection
  - SEND_CHAT_MESSAGE - Submit message to chat
  - START_AUTH - Initiate OAuth flow
  - GET_AUTH_STATUS - Check authentication state
  - LOGOUT - Clear tokens
  - STORE_VIEWER_TOKEN - Save JWT after OAuth
  - GET_CONNECTION_STATE - Query WebSocket state

---

*Integration audit: 2026-03-12*
