import { test } from '@playwright/test';

test.describe('Kick Detection — KICK-01', () => {

  test.skip('KICK-01a: isLiveStream() returns true when [data-state="live"] badge present', () => {
    // Implementation pending
    // fs test: read src/content-scripts/kick.ts, assert isLiveStream checks [data-state="live"]
  });

  test.skip('KICK-01b: isLiveStream() returns true when #channel-chatroom exists and is visible (fallback)', () => {
    // Implementation pending
    // fs test: read src/content-scripts/kick.ts, assert fallback live detection via #channel-chatroom presence
  });

  test.skip('KICK-01c: isLiveStream() returns false and emits console.warn when no live signal found', () => {
    // Implementation pending
    // fs test: read src/content-scripts/kick.ts, assert console.warn call when no live signal
  });

  // Needs page fixture and built extension — skipped via runtime test.skip()
  test('KICK-01d: kick.ts content script does not inject on non-live Kick page', async ({ page }) => {
    test.skip();
    // Requires built extension + fixture page
    // Implementation pending
  });

  // Wave 0 scaffold — remove test.skip as each KICK-01 requirement is implemented
});
