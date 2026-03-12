# Phase 4: LLM Test Infrastructure - Research

**Researched:** 2026-03-12
**Domain:** Playwright Chrome Extension Testing, Mock WebSocket Server, CI Configuration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**LLM agent architecture (major departure from initial requirements)**
- Claude-via-MCP IS the LLM agent — no Stagehand dependency, no automated agent spec files
- The Playwright MCP browser already has the extension loaded and confirmed working — this is the test environment for agent scenarios
- Agent scenarios run against real platform pages via MCP browser (not fixture HTML pages)
- Deliverable: scenario definition markdown files in `tests/agent/` (e.g., `twitch-scenario.md`, `youtube-scenario.md`, `kick-scenario.md`) that Claude follows using MCP tools
- TEST-03 (Stagehand LlmAgent helper) is dropped — no Stagehand, Claude is the agent
- TEST-07 (ANTHROPIC_API_KEY CI secret) is dropped — no automated CI runner for agent tests

**Test suite separation**
- Fast suite: `npx playwright test --grep-invert @agent`
- Agent suite: `npx playwright test --grep @agent` (but agent tests are scenario files, not spec files — the grep flag is for any spec-level agent tests if added later)
- Tag format: `test.describe('Feature @agent', ...)` — title suffix, not structured annotation
- npm scripts to add:
  - `"test": "npx playwright test --grep-invert @agent"`
  - `"test:agent": "npx playwright test --grep @agent"`

**Fast suite — implement skipped tests**
- Phase 4 implements the currently-skipped Playwright tests so `npm test` runs something meaningful
- Skipped tests cover: injection checks (INJ-01 through INJ-08), design system (DS-*), Kick injection/detection (KICK-*)
- `frameLocator('iframe[data-platform]')` used for all in-iframe assertions (TEST-06)
- Open problem for researcher: `npx playwright test` with `--load-extension` args doesn't visibly load the extension (user observed this) — the researcher must investigate and solve the extension loading problem before fast suite tests can be implemented

**Mock WebSocket server (TEST-01)**
- Standalone Node.js ws:// server at `tests/fixtures/mock-ws-server.ts`
- Started via Playwright `globalSetup`, stopped via `globalTeardown`
- Sends same JSON message format as allch.at backend (not a simplified test format)
- Used by fast suite tests against fixture HTML pages
- Agent scenario tests do NOT use the mock WS — they run against real platform pages via MCP

**Fixture HTML pages (TEST-02)**
- Existing `tests/fixtures/twitch-mock.html`, `youtube-mock.html`, `kick-mock.html` kept as-is
- Used for fast suite tests only

**CI job structure**
- Add a new `test` job to `.github/workflows/build-and-release.yml`
- Separate job (not a step inside `build`) — downloads the built artifact, installs Playwright, runs `npm test`
- Runs on every PR and push to main (same triggers as the build job)
- Uses `xvfb-run -a npm test` for virtual display on ubuntu-latest (Chrome extensions require non-headless mode)
- No CI job for agent tests — agent tests are manual Claude MCP sessions only

### Claude's Discretion
- Exact port for mock WS server
- How to pass mock WS server port to fixture pages / extension (env var vs hardcoded test port)
- Exact structure of scenario definition markdown files
- Whether to use Playwright `webServer` config vs manual globalSetup for the WS server

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Mock WebSocket server (`tests/fixtures/mock-ws-server.ts`) provides deterministic chat messages for all test scenarios | `ws` npm package provides Node.js WebSocket server; globalSetup/globalTeardown pattern confirmed; ChatMessage/WebSocketMessage types from `src/lib/types/message.ts` define exact wire format |
| TEST-02 | Fixture HTML pages for Twitch, YouTube, and Kick served locally for offline injection tests | Three fixture HTML files already exist in `tests/fixtures/`; extension loading requires `page.route()` to serve them at platform URLs (see Extension Loading Problem section) |
| TEST-03 | DROPPED — no Stagehand, Claude is the agent | N/A |
| TEST-04 | Agent test specs in `tests/agent/` tagged `@agent` — excluded from default CI fast run | Scenario markdown files replace spec files; `--grep-invert @agent` pattern confirmed for npm test script |
| TEST-05 | At least one passing LLM-agent scenario per platform: chat visible, platform badge correct, message send flow | Scenario markdown files with numbered steps; MCP Playwright browser is the execution environment |
| TEST-06 | `frameLocator('iframe[data-platform]')` used for all in-iframe Playwright assertions | `data-platform` attribute set by `PlatformDetector.injectAllChatUI()` — confirmed in source; `frameLocator()` is the correct Playwright API for cross-frame assertions |
| TEST-07 | DROPPED — no CI runner for agent tests; agent tests are manual MCP sessions | N/A |
</phase_requirements>

## Summary

Phase 4 builds the test infrastructure that was scaffolded (skipped) in earlier phases. The core challenge is getting the Chrome extension to actually inject into fixture HTML pages during Playwright test runs — the manifest's `content_scripts.matches` only covers `https://www.twitch.tv/*`, `https://www.youtube.com/watch*`, `https://www.youtube.com/live/*`, and `https://kick.com/*`, so neither `file://` URLs nor `localhost` trigger content script injection. The solution is `page.route()` in each test to intercept navigations to platform URLs and serve the local fixture HTML body, so the content scripts inject as if on the real platform.

The mock WebSocket server belongs in `globalSetup` using the `ws` npm package. The service worker connects to `ws://{API_BASE_URL}/ws/chat/{streamer}` — during tests that URL is `ws://localhost:8080/ws/chat/{streamer}` because the built extension uses `API_BASE_URL = process.env.API_URL || 'http://localhost:8080'`. The mock WS server must listen on port 8080 to intercept these connections without any fixture modification.

The agent deliverable is three markdown scenario files in `tests/agent/` — not Playwright spec files. These are human-readable scripts Claude follows in MCP browser sessions.

**Primary recommendation:** Use `page.route('https://www.twitch.tv/*', ...)` pattern to serve fixture HTML at real platform URLs, letting content scripts inject normally. Start mock WS on port 8080 via globalSetup.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | ^1.57.0 (already installed) | Test runner, browser automation, Chrome extension loading | Already in package.json; `--load-extension` arg already in playwright.config.ts |
| `ws` | ^8.x | Standalone Node.js WebSocket server for globalSetup | Industry standard; `ws` npm package is what `mock-ws-server.ts` should use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/ws` | ^8.x | TypeScript types for `ws` package | Required when writing `mock-ws-server.ts` in TypeScript |
| Node.js built-in `http` | — | Static file server alternative | Only if `webServer` config is chosen over `page.route()` for fixture serving |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `page.route()` for fixture serving | `webServer` config + localhost match in manifest | `webServer` requires adding `http://localhost:*` to manifest matches and `web_accessible_resources` — more invasive; `page.route()` requires no manifest changes |
| `ws` standalone server in globalSetup | `page.routeWebSocket()` per-test | `page.routeWebSocket()` only intercepts page-level WS, not WS opened by extension service workers; standalone server is required |
| Manual `globalSetup` for WS server | Playwright `webServer` config | Both work; `globalSetup` is lower-level but gives clean TypeScript with start/stop semantics; `webServer` is simpler but less control over WS protocol |

**Installation (new devDependencies needed):**
```bash
npm install --save-dev ws @types/ws
```

## Architecture Patterns

### Recommended Project Structure
```
tests/
├── fixtures/
│   ├── twitch-mock.html          # existing — keep as-is
│   ├── youtube-mock.html         # existing — keep as-is
│   ├── kick-mock.html            # existing — keep as-is
│   └── mock-ws-server.ts         # NEW: Node.js ws server for globalSetup
├── agent/
│   ├── twitch-scenario.md        # NEW: Claude MCP scenario script
│   ├── youtube-scenario.md       # NEW: Claude MCP scenario script
│   └── kick-scenario.md          # NEW: Claude MCP scenario script
├── test-slot-injection.spec.ts   # existing — implement skipped tests
├── test-design-system.spec.ts    # existing — implement skipped tests
├── test-kick-*.spec.ts           # existing — implement skipped tests
└── test-postmessage-origin.spec.ts  # existing — most tests already pass
playwright.config.ts              # add globalSetup/globalTeardown
```

### Pattern 1: Extension Loading via page.route()

**What:** Intercept navigations to real platform URLs and serve local fixture HTML as the response body, so content scripts with `matches: ["https://www.twitch.tv/*"]` fire normally.

**When to use:** Any fast suite test that needs the extension to inject into a fixture page.

**Why this works:** The extension sees the URL `https://www.twitch.tv/teststreamer` and injects the content script. The page receives the fixture HTML body. The extension's manifest matches fire on the URL, not the content.

**Example:**
```typescript
// Source: Playwright docs - route.fulfill()
test('INJ-01: Twitch iframe mounts in .chat-shell', async ({ page }) => {
  const fixtureHtml = fs.readFileSync(
    path.resolve(__dirname, 'fixtures/twitch-mock.html'), 'utf8'
  );
  await page.route('https://www.twitch.tv/**', async route => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml });
  });
  await page.goto('https://www.twitch.tv/teststreamer');
  // Content script now runs because URL matched manifest
  const container = page.locator('.chat-shell #allchat-container');
  await expect(container).toBeAttached({ timeout: 10000 });
});
```

**Critical caveat:** The extension service worker (`chrome.runtime.sendMessage`) also fires during `init()`. Tests for injection shape (INJ-01, INJ-02, INJ-04, INJ-06) need to either:
1. Also route the API call (`/api/v1/auth/streamers/...`) to return a mock streamer response, OR
2. Route it to return 404 (STREAMER_NOT_FOUND) — which means the extension shows the "not configured" badge and does NOT inject the AllChat UI

For tests asserting that `#allchat-container` IS present, option 1 is needed: route `https://allch.at/api/v1/auth/streamers/**` to return a valid `StreamerInfo` JSON. For tests asserting the fixture DOM structure without extension injection (pure DOM tests), option 2 works fine.

### Pattern 2: globalSetup for Mock WebSocket Server

**What:** Start a `ws` WebSocket server before the test suite, expose its port via `process.env`, stop it in teardown.

**When to use:** Any test that needs the extension's service worker to receive chat messages.

**Example:**
```typescript
// tests/fixtures/mock-ws-server.ts
// Source: ws npm package README (https://github.com/websockets/ws)
import { WebSocketServer, WebSocket } from 'ws';

let wss: WebSocketServer | null = null;

export async function startMockWsServer(port = 8080): Promise<WebSocketServer> {
  wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    });
  });
  return wss;
}

export async function stopMockWsServer(): Promise<void> {
  return new Promise((resolve) => {
    if (wss) {
      wss.close(() => resolve());
    } else {
      resolve();
    }
  });
}

// globalSetup.ts
export default async function globalSetup() {
  const { startMockWsServer } = await import('./tests/fixtures/mock-ws-server');
  await startMockWsServer(8080);
  process.env.MOCK_WS_PORT = '8080';
}

// globalTeardown.ts
export default async function globalTeardown() {
  const { stopMockWsServer } = await import('./tests/fixtures/mock-ws-server');
  await stopMockWsServer();
}
```

**Port choice rationale:** Port 8080 is already in the extension's `API_BASE_URL` fallback (`http://localhost:8080`) via `src/config.ts`. The built production extension uses `https://allch.at`, but a test build with `API_URL=http://localhost:8080` webpack DefinePlugin will use port 8080. The mock WS server URL pattern will be `ws://localhost:8080/ws/chat/{streamer}`.

### Pattern 3: frameLocator for In-Iframe Assertions (TEST-06)

**What:** Use `page.frameLocator('iframe[data-platform]')` to scope selectors inside the AllChat iframe.

**When to use:** Any assertion about the AllChat UI content (chat messages, platform badge, input field, InfinityLogo).

**Example:**
```typescript
// Source: Playwright frameLocator docs
const iframe = page.frameLocator('iframe[data-platform]');
// Platform badge
await expect(iframe.locator('[data-platform-badge="twitch"]')).toBeVisible();
// Chat visibility
await expect(iframe.locator('.chat-messages')).toBeVisible();
```

**Why `data-platform` attribute exists:** `PlatformDetector.injectAllChatUI()` sets `iframe.setAttribute('data-platform', this.platform)` — verified in `src/content-scripts/base/PlatformDetector.ts` line 178.

### Pattern 4: Agent Scenario Markdown Files

**What:** Numbered-step scripts in `tests/agent/` that Claude reads and executes via Playwright MCP browser.

**Structure:**
```markdown
# Twitch Agent Scenario

## Prerequisites
- Playwright MCP browser with extension loaded
- Navigate to a live Twitch stream

## Steps
1. Navigate to https://www.twitch.tv/{streamer}
2. Wait 5 seconds for extension to initialize
3. Assert: `#allchat-container` exists inside `.chat-shell`
4. Assert: iframe with `data-platform="twitch"` is visible
5. Inside iframe: assert platform badge shows "twitch" color accent (#A37BFF)
6. Inside iframe: assert chat messages area is visible
7. Inside iframe: locate the chat input, type "test message"
8. Assert: typed text appears in the input field

## Success Criteria
- AllChat iframe visible, not blank
- Platform badge color matches twitch accent
- Chat input accepts text
```

### Anti-Patterns to Avoid

- **Using `page.$` or raw CSS selectors on platform page for iframe content:** Violates TEST-06. Always use `page.frameLocator('iframe[data-platform]')` for AllChat UI assertions.
- **Navigating to `file://` fixture URLs:** Content scripts will NOT run because `file://` is not in manifest `matches`. Use `page.route()` to serve fixture HTML at real platform URLs.
- **Navigating to `http://localhost:...` without manifest change:** Same problem — not in `matches`. Use `page.route()` intercepting `https://www.twitch.tv/**` etc.
- **Using `headless: true`:** Chrome extensions require `headless: false`. The existing playwright.config.ts already sets this correctly — do not change it.
- **Not routing the allch.at API call:** Content script `init()` calls `checkStreamerExists()` via `chrome.runtime.sendMessage` → service worker → `fetch(https://allch.at/api/v1/auth/streamers/...)`. If that 404s (no mock), extension skips UI injection. Tests for injected UI must also mock this API call.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket server | Custom TCP/HTTP server | `ws` npm package | `ws` handles WebSocket handshake, frames, close codes, ping/pong protocol correctly; hand-rolling is 500+ lines of RFC 6455 |
| Page route for fixture serving | Manual proxy server | `page.route()` + `route.fulfill()` | Playwright intercepts at the browser level; no separate process to manage |
| Cross-frame assertions | Custom iframe eval | `page.frameLocator()` | Handles frame attachment timing, retry logic, proper Playwright error messages |
| Test filtering by tag | Custom test runner script | `--grep-invert @agent` built into Playwright CLI | Playwright's `--grep` uses regex against test title; no custom logic needed |

**Key insight:** The WebSocket mock server must be a real `ws://` server (not `page.routeWebSocket()`) because the WebSocket is opened by the extension service worker, not by the page itself. `page.routeWebSocket()` only intercepts WebSockets initiated by the page's JavaScript context.

## Common Pitfalls

### Pitfall 1: Content Script Not Injecting on Fixture Pages
**What goes wrong:** `page.goto(twitchFixture)` where `twitchFixture = 'file://...'` — extension content script never runs, test fails with "element not found".
**Why it happens:** Manifest `content_scripts.matches` only lists `https://www.twitch.tv/*`. File URLs and localhost URLs don't match.
**How to avoid:** Use `page.route('https://www.twitch.tv/**', route => route.fulfill({...fixture HTML...}))` before `page.goto('https://www.twitch.tv/teststreamer')`.
**Warning signs:** `#allchat-container` never appears in test; no console log `[AllChat twitch] Initializing...` on the page.

### Pitfall 2: Extension Injects But UI Does Not Appear (API check fails)
**What goes wrong:** Content script runs, but `init()` calls `checkStreamerExists()` which hits `https://allch.at/api/...`. In CI, this fails with network error or 404, so the extension falls back to showing the "not configured" badge and never injects `#allchat-container`.
**Why it happens:** `PlatformDetector.init()` returns early if `checkStreamerExists()` returns `null`.
**How to avoid:** Also route `https://allch.at/api/v1/auth/streamers/**` to return a valid `StreamerInfo` mock response in tests that assert AllChat UI injection.
**Warning signs:** Badge `#allchat-not-configured-badge` appears instead of `#allchat-container`; console log says `Streamer not in database`.

### Pitfall 3: Mock WS Server Port Mismatch
**What goes wrong:** Mock WS server starts on a different port than the built extension expects (`ws://localhost:8080/ws/chat/...`).
**Why it happens:** `src/config.ts` uses `process.env.API_URL || 'http://localhost:8080'` — but only the dev build has `API_URL` unset. The CI test job downloads the `production` artifact built with `API_URL=https://allch.at`, so the extension connects to `wss://allch.at/ws/chat/...` not `ws://localhost:8080`.
**How to avoid:** The CI test job must build the extension with `API_URL=http://localhost:8080` (test build), OR the test suite must intercept the real WebSocket URL with `page.routeWebSocket()`. Best approach: dedicated test build step in CI with `API_URL=http://localhost:8080 npm run build`.
**Warning signs:** Mock WS receives no connections; extension times out on WebSocket connect.

### Pitfall 4: xvfb-run Not Available / Extension Fails in CI
**What goes wrong:** GitHub Actions `ubuntu-latest` runs Playwright in headless mode, extensions don't load.
**Why it happens:** Chrome extensions require a real display context; headless Chrome ignores `--load-extension`.
**How to avoid:** The CI `test` job must run `xvfb-run -a npm test` and install `xvfb` if not present on the runner. Ubuntu-latest GitHub Actions runners have `xvfb` pre-installed via `xvfb-run` command.
**Warning signs:** No content script logs in CI; all fixture tests fail with element not found.

### Pitfall 5: web_accessible_resources Not Matching Routed URL
**What goes wrong:** Extension injects content script at `https://www.twitch.tv/teststreamer`, creates iframe with `src=chrome-extension://.../ui/chat-container.html`. The iframe loads but receives no `ALLCHAT_INIT` postMessage.
**Why it happens:** `web_accessible_resources` in manifest specifies `"matches": ["https://www.twitch.tv/*", ...]` — since we're routing the real URL, this should work fine. However, if the test uses a URL that doesn't match the `web_accessible_resources.matches`, the iframe src will be blocked.
**How to avoid:** Use platform URLs that match the manifest (`https://www.twitch.tv/teststreamer` not `https://twitch.tv/teststreamer` — note www subdomain).
**Warning signs:** Iframe `src` attribute set but iframe blank; console error about blocked web accessible resource.

### Pitfall 6: Skipped Tests That Cannot Be Trivially Unskipped
**What goes wrong:** Some skipped tests in existing spec files (e.g., `test-kick-detection.spec.ts`) test source file contents with `fs.readFileSync` — these actually work without extension loading and can be unskipped directly.
**Why it happens:** All tests were conservatively skipped in earlier phases pending Phase 4.
**How to avoid:** Categorize existing skipped tests:
  - Static `test.skip(...)` with sync body (fs/string checks) — can run immediately, just remove the skip
  - Runtime `test.skip()` inside async body — needs `page.route()` pattern for extension loading

## Code Examples

Verified patterns from official sources:

### page.route() Serving Fixture HTML
```typescript
// Source: https://playwright.dev/docs/network
import fs from 'fs';
import path from 'path';

test('extension injects on Twitch', async ({ page }) => {
  const html = fs.readFileSync(
    path.resolve(__dirname, 'fixtures/twitch-mock.html'), 'utf8'
  );
  // Route BEFORE goto
  await page.route('https://www.twitch.tv/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html })
  );
  // Also mock the allch.at API so extension proceeds past streamer check
  await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        username: 'teststreamer',
        platforms: [{ platform: 'twitch', channel_id: 'test123' }]
      })
    })
  );
  await page.goto('https://www.twitch.tv/teststreamer');
  // Extension content script fires; wait for injection
  await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
});
```

### globalSetup / globalTeardown for WS Server
```typescript
// playwright.config.ts additions
export default defineConfig({
  globalSetup: require.resolve('./tests/fixtures/global-setup.ts'),
  globalTeardown: require.resolve('./tests/fixtures/global-teardown.ts'),
  // ...existing config
});
```

### WebSocket Server Wire Format (from src/lib/types/message.ts)
```typescript
// The mock WS server must send messages in this exact shape:
interface WebSocketMessage {
  type: 'chat_message' | 'ping' | 'pong' | 'error' | 'connected';
  data?: ChatMessage | { overlay_id: string };
  timestamp?: string;
  error?: string;
}

interface ChatMessage {
  id: string;
  overlay_id: string;
  platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';
  channel_id: string;
  channel_name: string;
  user: { id: string; username: string; display_name: string; badges: Badge[]; color?: string };
  message: { text: string; emotes: Emote[] };
  timestamp: string;
  metadata: Record<string, unknown>;
}
```

### frameLocator for In-Iframe Assertions
```typescript
// Source: https://playwright.dev/docs/api/class-framelocator
// data-platform attribute set by PlatformDetector.injectAllChatUI()
const iframe = page.frameLocator('iframe[data-platform]');
await expect(iframe.locator('.chat-messages')).toBeVisible({ timeout: 10000 });
```

### GitHub Actions CI test job with xvfb
```yaml
# Source: Playwright CI docs + community examples
test:
  needs: build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    - run: npm ci
    - run: npx playwright install chromium --with-deps
    - name: Download build artifact
      uses: actions/download-artifact@v4
      with:
        name: allchat-extension-${{ needs.build.outputs.version }}
        # downloads to current dir as allchat-extension.zip
    - run: unzip allchat-extension.zip -d dist
    - name: Run fast test suite
      run: xvfb-run -a npm test
```

### npm scripts to add to package.json
```json
{
  "scripts": {
    "test": "npx playwright test --grep-invert @agent",
    "test:agent": "npx playwright test --grep @agent"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stagehand LlmAgent | Claude-via-MCP as the agent | Phase 4 context decision | TEST-03 and TEST-07 dropped; scenario files replace spec files for agent tests |
| All tests `test.skip()` | Fast suite tests implemented | Phase 4 | `npm test` will run meaningful assertions |
| No npm test script | `test` and `test:agent` scripts | Phase 4 | CI can invoke `npm test` predictably |
| Agent tests in CI with API key | Manual MCP sessions only | Phase 4 context decision | No ANTHROPIC_API_KEY required in CI |

**Deprecated/outdated patterns already in the codebase:**
- `file://` paths in test files (e.g., `twitchFixture = 'file://...'` in `test-slot-injection.spec.ts`): These URLs will never trigger content script injection. The existing skipped test bodies using these paths must be rewritten to use `page.route()`.
- `test.skip()` static form (first argument, no async body): These can run as-is once the `test.skip(...)` call is removed — they test filesystem contents, not browser behavior.

## Open Questions

1. **API_URL in the test build for CI**
   - What we know: Production artifact uses `API_URL=https://allch.at`; the test job needs `ws://localhost:8080`
   - What's unclear: Whether CI should build a separate test artifact or use `page.route()` to intercept the production WS URL (`wss://allch.at/ws/chat/...`)
   - Recommendation: Build a test artifact in the `test` CI job with `API_URL=http://localhost:8080 npm run build` — simpler than routing WSS traffic. Alternatively, route `wss://allch.at/ws/**` with `browserContext.routeWebSocket()` since the WS is opened by the service worker (may not work — verify). Safest path: dedicated test build.

2. **Service worker WebSocket vs page WebSocket interception**
   - What we know: `page.routeWebSocket()` intercepts WS from the page JS context. The extension's WebSocket is opened in `background/service-worker.ts` which runs as a Chrome service worker, not in the page context.
   - What's unclear: Whether `browserContext.routeWebSocket()` or a service-worker-level route can intercept extension service worker WS connections.
   - Recommendation: Use a real `ws` server on port 8080 via globalSetup — this definitely works regardless of WS origin.

3. **web_accessible_resources restriction in test context**
   - What we know: `web_accessible_resources.matches` only lists production domains. When tests route `https://www.twitch.tv/**` to serve fixture HTML, the URL matches and the extension's iframe `src` (`chrome-extension://...`) should load.
   - What's unclear: Edge cases with `web_accessible_resources` when the page is technically "served" via `route.fulfill()` — does Chrome consider it to be on `twitch.tv`?
   - Recommendation: Test this early in Wave 1; if iframe src is blocked, add a test-specific entry OR verify behavior in practice.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.57.0 |
| Config file | `playwright.config.ts` (exists) |
| Quick run command | `npx playwright test --grep-invert @agent` |
| Full suite command | `npx playwright test --grep-invert @agent` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Mock WS server starts, accepts connections, sends ChatMessage JSON | integration | `npx playwright test --grep-invert @agent` | ❌ Wave 0 — `tests/fixtures/mock-ws-server.ts` |
| TEST-02 | Fixture HTML pages exist and are served correctly | smoke | `npx playwright test --grep-invert @agent` | ✅ fixtures exist; routing logic Wave 0 |
| TEST-04 | `npm test` excludes @agent tests; `npm test:agent` includes them | smoke | `npm test` (must complete without agent tests) | ❌ Wave 0 — npm scripts not yet in package.json |
| TEST-05 | Agent scenarios run manually via MCP; not automated | manual-only | Claude MCP session | ❌ Wave 0 — `tests/agent/` scenario files |
| TEST-06 | `frameLocator('iframe[data-platform]')` used in all fixture-requiring tests | unit | `npx playwright test --grep-invert @agent` | ❌ Wave 0 — must rewrite existing skipped test bodies |

### Sampling Rate
- **Per task commit:** `npx playwright test --grep-invert @agent`
- **Per wave merge:** `npx playwright test --grep-invert @agent`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/fixtures/mock-ws-server.ts` — covers TEST-01
- [ ] `tests/fixtures/global-setup.ts` — starts mock WS server
- [ ] `tests/fixtures/global-teardown.ts` — stops mock WS server
- [ ] `tests/agent/twitch-scenario.md` — covers TEST-04, TEST-05
- [ ] `tests/agent/youtube-scenario.md` — covers TEST-05
- [ ] `tests/agent/kick-scenario.md` — covers TEST-05
- [ ] `package.json` `test` and `test:agent` scripts — covers TEST-04
- [ ] `playwright.config.ts` `globalSetup`/`globalTeardown` entries
- [ ] Rewrite existing skipped test bodies to use `page.route()` pattern — covers TEST-02, TEST-06
- [ ] Framework install: `npm install --save-dev ws @types/ws`

## Sources

### Primary (HIGH confidence)
- Playwright docs - `playwright.dev/docs/chrome-extensions` — extension loading, `--load-extension`, headless behavior
- Playwright docs - `playwright.dev/docs/network` — `page.route()` / `route.fulfill()` for intercepting navigation and serving fixture HTML
- Playwright docs - `playwright.dev/docs/test-global-setup-teardown` — globalSetup/globalTeardown pattern, passing data via `process.env`
- Playwright docs - `playwright.dev/docs/api/class-websocketroute` — `page.routeWebSocket()` limitations (page context only)
- Playwright docs - `playwright.dev/docs/test-webserver` — `webServer` config as alternative
- `src/content-scripts/base/PlatformDetector.ts` (verified in codebase) — `data-platform` attribute set at line 178
- `src/config.ts` (verified in codebase) — `API_BASE_URL = 'http://localhost:8080'` default
- `manifest.json` (verified in codebase) — `content_scripts.matches` covers only production platform URLs
- `src/lib/types/message.ts` (verified in codebase) — `WebSocketMessage` and `ChatMessage` wire format
- `src/background/service-worker.ts` (verified in codebase) — WS URL pattern `${wsUrl}/ws/chat/${streamerUsername}`
- `ws` npm package — `npmjs.com/package/ws` — standard Node.js WebSocket server

### Secondary (MEDIUM confidence)
- Playwright CI docs + community examples — `xvfb-run -a npm test` pattern confirmed for ubuntu-latest GitHub Actions
- Chrome Extensions developer docs — match patterns syntax; `file://` requires explicit `allow_file_access`, platform https URLs match normally

### Tertiary (LOW confidence)
- Whether `browserContext.routeWebSocket()` can intercept extension service worker WebSockets — not confirmed; treat as LOW until tested

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `ws` is the standard Node.js WS library; Playwright APIs verified against official docs
- Architecture (page.route pattern): HIGH — Playwright docs confirm `route.fulfill()` works for initial navigations
- Extension loading problem root cause: HIGH — manifest `content_scripts.matches` verified in codebase; `file://` URL mismatch confirmed
- Pitfalls: HIGH — most derived from actual codebase inspection (API check, web_accessible_resources, port)
- CI xvfb-run approach: MEDIUM — confirmed by Playwright CI docs and community examples, not tested in this specific repo

**Research date:** 2026-03-12
**Valid until:** 2026-06-12 (Playwright 1.x APIs are stable; WS server patterns are very stable)
