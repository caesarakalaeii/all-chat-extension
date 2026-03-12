import { test, expect } from '@playwright/test';
import path from 'path';

const youtubeFixture = `file://${path.resolve('tests/fixtures/youtube-mock.html')}`;

test.describe('INJ-05: YouTube SPA navigation triggers teardown and re-init', () => {
  test.skip('navigating away removes allchat-container and style tag', async ({ page }) => {
    await page.goto(youtubeFixture);
    // Simulate yt-navigate-finish event
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('yt-navigate-finish'));
    });
    // After teardown, native chat should be visible (no hide style)
    const hideStyle = page.locator('style#allchat-hide-native-style');
    await expect(hideStyle).not.toBeAttached();
  });

  test.skip('yt-navigate-finish does not double-init when popstate also fires', async ({ page }) => {
    await page.goto(youtubeFixture);
    const logMessages: string[] = [];
    page.on('console', msg => logMessages.push(msg.text()));
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('yt-navigate-finish'));
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(300);
    const initCount = logMessages.filter(m => m.includes('Navigation detected')).length;
    expect(initCount).toBeLessThanOrEqual(1);
  });
});
