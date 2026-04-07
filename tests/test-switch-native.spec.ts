import { test } from '@playwright/test';

test.describe('Switch to native chat', () => {
  test.skip('POP-06: "Switch to native" in-page hides AllChat and shows native chat', async () => {
    // Wave 3: Verify SWITCH_TO_NATIVE hides #allchat-container and restores native chat
  });

  test.skip('POP-07: "Switch to AllChat" in native chat re-shows AllChat', async () => {
    // Wave 3: Verify clicking injected "Switch to AllChat" button restores AllChat iframe
  });
});
