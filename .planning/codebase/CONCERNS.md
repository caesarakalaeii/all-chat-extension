# Technical Concerns

## Tech Debt

### Code Quality
- **Heavy logging** — `console.log` calls throughout, including in production paths; should be gated behind a debug flag
- **Large files** — content scripts approaching 500 lines; candidate for splitting into focused modules
- **`any` types** — some bare catch blocks use `error: any` instead of typed error handling
- **Bare catch blocks** — some catches silently swallow errors without logging or propagation

### Architecture
- **No message deduplication** — incoming WebSocket messages are not deduplicated; rapid reconnects could result in duplicate chat entries
- **Unbounded message array** — `ChatContainer` likely accumulates messages without a cap, which will degrade performance on long streams
- **Single WebSocket per extension instance** — works for single-streamer use, but is a hard constraint against multi-tab or multi-streamer scenarios

---

## Known Bugs / Risk Areas

### WebSocket Reconnection
- Race condition possible if `DISCONNECT_WEBSOCKET` is called while a reconnect timeout is pending — `reconnectTimeoutId` may not be cleared in all edge cases
- Backoff is linear (`delay = BASE * attempts`) not exponential — at 10 attempts, delay is 10 seconds, not progressively increasing

### UI Injection (MutationObserver)
- Duplicate container bug existed (test in `tests/test-container-cleanup.spec.ts`) — fix is in place but the detection logic is fragile; DOM mutation-based injection can re-trigger on SPA navigation

### YouTube Detection
- Uses 4 separate methods to detect live stream status — brittle against YouTube layout changes; any selector change breaks detection
- Username extraction from DOM is fragile; extraction relies on specific element structures that YouTube can change without notice

### Chrome Storage
- `getSyncStorage` / `getLocalStorage` patterns use callbacks under the hood (Manifest V3 still has quirks here); async wrapper could mask errors

---

## Security Concerns

### postMessage
- Content script accepts `postMessage` from the iframe without strict origin validation — could accept messages from other extensions or frames on the same page
- Recommend: validate `event.origin` to match the extension's own origin

### JWT Token
- Token is stored in `chrome.local.storage` without encryption — accessible to any extension with `storage` permission
- Token is decoded client-side (base64 split) to check expiry; no signature verification (intentional but worth documenting)

### Console Leaks
- Logging in production may expose internal API URLs and state transitions to users inspecting the console

---

## Performance Bottlenecks

### Fixed Delays
- Some retry/debounce logic uses fixed delays (`setTimeout`) instead of adaptive timing

### MutationObserver
- Content scripts use `MutationObserver` on broad DOM targets; this runs on every DOM mutation on the page, which is expensive on complex SPAs like YouTube/Twitch

### Emote Caching
- Emotes are not cached between page navigations — each stream load re-fetches 7TV/BTTV/FFZ assets
- Twitch badges are cached (`twitchBadges.ts`) but may not persist across service worker restarts

### Tab Broadcasting
- `broadcastConnectionState` queries ALL tabs and sends to each — O(n) for tab count; will scale poorly if user has many tabs open

---

## Fragile Areas

| Area | Risk | Reason |
|------|------|--------|
| YouTube live detection | High | DOM-selector based, 4 fallback methods |
| YouTube username extraction | High | Relies on specific DOM structure |
| Twitch selectors | Medium | CSS class-based, can change |
| `MutationObserver` injection | Medium | SPA navigation can re-trigger injection |
| Service worker lifecycle | Medium | MV3 service workers can be killed; state (WS connection) is lost |

---

## Missing Features / Gaps

- **Popup functionality incomplete** — popup.tsx exists but may lack full settings/auth flows
- **Error boundaries** — React UI has no error boundary components; uncaught render errors will crash the entire chat iframe
- **Streamer state cleanup** — when navigating away from a stream, cleanup may not fire reliably on all navigation patterns

---

## Test Coverage Gaps

| Area | Coverage |
|------|---------|
| Content scripts | None (no unit tests) |
| Service worker API proxy | None |
| WebSocket reconnection logic | None |
| Error handling paths | None |
| YouTube stream detection | None |
| Emote rendering | None |
| Container cleanup (regression) | ✓ (`test-container-cleanup.spec.ts`) |
| Streamer switch flow | ✓ (`test-streamer-switch.spec.ts`) |

---

## Dependencies at Risk

| Dependency | Risk |
|------------|------|
| 7TV API | Third-party, unofficial — can change without notice |
| BTTV API | Third-party, unofficial |
| FFZ API | Third-party, unofficial |
| YouTube DOM selectors | YouTube deploys frequently; selectors break silently |
| Twitch DOM selectors | Same risk as YouTube |
| `allch.at` API | Internal but version-locked |
