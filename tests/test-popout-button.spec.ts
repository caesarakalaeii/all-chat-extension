import { test } from '@playwright/test';

test.describe('Pop-out button', () => {
  test.skip('POP-01: pop-out button appears in AllChat header on all platforms', async () => {
    // Wave 1: Verify pop-out button renders in ChatContainer header
  });

  test.skip('POP-02: window.open called with correct chat-container.html URL and popout=1 param', async () => {
    // Wave 2: Verify content script opens pop-out window with correct URL
  });

  test.skip('POP-03: in-page iframe shows "Chat popped out" banner after pop-out opens', async () => {
    // Wave 2: Verify POPOUT_OPENED message triggers banner display
  });

  test.skip('POP-04: closing pop-out window restores in-page AllChat iframe', async () => {
    // Wave 2: Verify POPOUT_CLOSED message restores normal chat UI
  });

  test.skip('POP-05: pop-out window dimensions persisted to chrome.storage.local', async () => {
    // Wave 2: Verify popout_window_width/height/x/y written to storage
  });
});
