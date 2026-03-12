# Phase 4: LLM Test Infrastructure - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a working test infrastructure: implement the currently-skipped Playwright fast suite tests, wire the fast suite into CI (GitHub Actions), and create LLM-agent scenario definition files that Claude executes via the Playwright MCP browser. No new platforms, no design system changes — testing infrastructure only.

</domain>

<decisions>
## Implementation Decisions

### LLM agent architecture (major departure from initial requirements)
- Claude-via-MCP IS the LLM agent — no Stagehand dependency, no automated agent spec files
- The Playwright MCP browser already has the extension loaded and confirmed working — this is the test environment for agent scenarios
- Agent scenarios run against real platform pages via MCP browser (not fixture HTML pages)
- Deliverable: scenario definition markdown files in `tests/agent/` (e.g., `twitch-scenario.md`, `youtube-scenario.md`, `kick-scenario.md`) that Claude follows using MCP tools
- TEST-03 (Stagehand LlmAgent helper) is dropped — no Stagehand, Claude is the agent
- TEST-07 (ANTHROPIC_API_KEY CI secret) is dropped — no automated CI runner for agent tests

### Test suite separation
- Fast suite: `npx playwright test --grep-invert @agent`
- Agent suite: `npx playwright test --grep @agent` (but agent tests are scenario files, not spec files — the grep flag is for any spec-level agent tests if added later)
- Tag format: `test.describe('Feature @agent', ...)` — title suffix, not structured annotation
- npm scripts to add:
  - `"test": "npx playwright test --grep-invert @agent"`
  - `"test:agent": "npx playwright test --grep @agent"`

### Fast suite — implement skipped tests
- Phase 4 implements the currently-skipped Playwright tests so `npm test` runs something meaningful
- Skipped tests cover: injection checks (INJ-01 through INJ-08), design system (DS-*), Kick injection/detection (KICK-*)
- `frameLocator('iframe[data-platform]')` used for all in-iframe assertions (TEST-06)
- Open problem for researcher: `npx playwright test` with `--load-extension` args doesn't visibly load the extension (user observed this) — the researcher must investigate and solve the extension loading problem before fast suite tests can be implemented. Options include: Playwright `page.route()` to serve fixtures at platform URLs, a test build with localhost match patterns, or identifying what the MCP browser does differently.

### Mock WebSocket server (TEST-01)
- Standalone Node.js ws:// server at `tests/fixtures/mock-ws-server.ts`
- Started via Playwright `globalSetup`, stopped via `globalTeardown`
- Sends same JSON message format as allch.at backend (not a simplified test format)
- Used by fast suite tests against fixture HTML pages
- Agent scenario tests do NOT use the mock WS — they run against real platform pages via MCP

### Fixture HTML pages (TEST-02)
- Existing `tests/fixtures/twitch-mock.html`, `youtube-mock.html`, `kick-mock.html` kept as-is
- Used for fast suite tests only
- Agent scenarios run against real platform pages (not these fixtures)

### CI job structure
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/fixtures/twitch-mock.html`, `youtube-mock.html`, `kick-mock.html`: fixture HTML pages exist for all 3 platforms — used for fast suite tests
- `playwright.config.ts`: already configured with `--load-extension` and `--disable-extensions-except` args pointing to `dist/` — foundation for fast suite tests
- `PlatformDetector.injectAllChatUI()`: already sets `data-platform` attribute on the iframe — `frameLocator('iframe[data-platform]')` will work once extension loads

### Established Patterns
- All existing tests use `test.skip()` — none are running yet; Phase 4 implements them
- Single worker (`workers: 1`), `headless: false` — keep these for extension compatibility
- HTML reporter already configured

### Integration Points
- `package.json` scripts: add `test` and `test:agent` entries (currently no test script exists)
- `.github/workflows/build-and-release.yml`: add `test` job after `build`
- `playwright.config.ts`: add `globalSetup` and `globalTeardown` for mock WS server
- `tests/fixtures/mock-ws-server.ts`: new file

</code_context>

<specifics>
## Specific Ideas

- The Playwright MCP browser (with extension loaded) is the confirmed working environment for agent tests — don't try to replicate it with `npx playwright test` for agent scenarios
- Fast suite CI uses `xvfb-run` — this is the standard Linux approach for non-headless Chrome in GitHub Actions
- Scenario files in `tests/agent/` should read like test scripts: numbered steps, what to navigate to, what to observe, what to assert

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-llm-test-infrastructure*
*Context gathered: 2026-03-12*
