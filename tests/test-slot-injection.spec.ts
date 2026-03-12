import { test, expect } from '@playwright/test';
import path from 'path';

const twitchFixture = `file://${path.resolve('tests/fixtures/twitch-mock.html')}`;
const youtubeFixture = `file://${path.resolve('tests/fixtures/youtube-mock.html')}`;

test.describe('INJ-01: Twitch iframe mounts in .chat-shell', () => {
  test('allchat-container is a child of .chat-shell', async ({ page }) => {
    await page.goto(twitchFixture);
    const container = page.locator('.chat-shell #allchat-container');
    await expect(container).toBeAttached();
  });
});

test.describe('INJ-02: No position:fixed container on Twitch page', () => {
  test('no element with position:fixed exists after injection', async ({ page }) => {
    await page.goto(twitchFixture);
    const fixed = page.locator('#allchat-container[style*="position: fixed"]');
    await expect(fixed).not.toBeAttached();
  });
});

test.describe('INJ-04: YouTube container inserted before ytd-live-chat-frame', () => {
  test.skip('allchat-container precedes ytd-live-chat-frame in DOM', async ({ page }) => {
    await page.goto(youtubeFixture);
    const order = await page.evaluate(() => {
      const container = document.getElementById('allchat-container');
      const native = document.querySelector('ytd-live-chat-frame');
      if (!container || !native) return null;
      const pos = container.compareDocumentPosition(native);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(order).toBe(true);
  });
});

test.describe('INJ-06: YouTube native chat hidden via style tag', () => {
  test.skip('ytd-live-chat-frame is hidden via injected style tag not inline style', async ({ page }) => {
    await page.goto(youtubeFixture);
    const styleTag = page.locator('style#allchat-hide-native-style');
    await expect(styleTag).toBeAttached();
    const inlineHidden = page.locator('ytd-live-chat-frame[style*="display: none"]');
    await expect(inlineHidden).not.toBeAttached();
  });
});
