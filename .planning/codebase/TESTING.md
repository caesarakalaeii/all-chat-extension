# Testing

## Framework

- **Playwright** v1.57.0 — end-to-end browser automation
- Configuration: `playwright.config.ts`
  - Single worker (sequential test execution)
  - HTML reporter
  - Non-headless mode (required for Chrome extension testing)

## Test Location

```
tests/
  test-container-cleanup.spec.ts   # duplicate container bug regression
  test-streamer-switch.spec.ts     # streamer switch flow E2E
playwright.config.ts
```

## Test Structure

```typescript
test.describe('Feature', () => {
  // setup / teardown hooks
  test('scenario', async ({ page }) => { ... })
})
```

## Coverage Areas

| Test File | Purpose |
|-----------|---------|
| `test-container-cleanup.spec.ts` | Integration test: ensures UI containers are cleaned up (no duplicates) |
| `test-streamer-switch.spec.ts` | Full E2E: browser automation with extension loaded, includes screenshots |

## Approach

- **No unit test mocks** — tests use real browser with the extension loaded
- Extension loaded as unpacked Chrome extension via Playwright
- Screenshots captured during test runs for visual verification
- Tests are integration/E2E only; no isolated unit tests

## Running Tests

```bash
npx playwright test
```

## Notes

- Tests require a Chrome/Chromium browser
- Single-worker config prevents race conditions with browser extension state
- Non-headless is intentional — extension behavior differs in headless mode
