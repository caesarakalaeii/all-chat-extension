import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const MOCK_STREAMER_YOUTUBE = JSON.stringify({
  username: 'teststreamer',
  platforms: [{ platform: 'youtube', channel_id: 'test123' }]
});

test.describe('INJ-05: YouTube SPA navigation triggers teardown and re-init', () => {
  test('navigating away removes allchat-container and style tag', async ({ page }) => {
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/youtube-mock.html'), 'utf8');
    await page.route('https://www.youtube.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_YOUTUBE })
    );
    await page.goto('https://www.youtube.com/watch?v=testid');
    // Wait for initial injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });

    // Simulate yt-navigate-finish event (YouTube SPA navigation)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('yt-navigate-finish'));
    });

    // After teardown, native chat style tag should be removed
    const hideStyle = page.locator('style#allchat-hide-native-style');
    await expect(hideStyle).not.toBeAttached({ timeout: 5000 });
  });

  test('yt-navigate-finish does not double-init when popstate also fires', async ({ page }) => {
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/youtube-mock.html'), 'utf8');
    await page.route('https://www.youtube.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_YOUTUBE })
    );
    await page.goto('https://www.youtube.com/watch?v=testid');
    // Wait for initial injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });

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
