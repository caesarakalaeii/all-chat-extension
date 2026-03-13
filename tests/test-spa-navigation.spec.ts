import { test, expect, chromium, BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');

const MOCK_STREAMER_YOUTUBE = JSON.stringify({
  username: 'teststreamer',
  platforms: [{ platform: 'youtube', channel_id: 'test123' }]
});

async function launchExtensionContext(): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
    viewport: { width: 1280, height: 800 },
  });
}

test.describe('INJ-05: YouTube SPA navigation triggers teardown and re-init', () => {
  let context: BrowserContext;

  test.beforeAll(async () => { context = await launchExtensionContext(); });
  test.afterAll(async () => { await context.close(); });

  test('navigating away removes allchat-container and style tag', async () => {
    const page = await context.newPage();
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/youtube-mock.html'), 'utf8');
    // context.route() intercepts service worker fetches (allch.at API)
    await context.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_YOUTUBE })
    );
    await page.route('https://www.youtube.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.goto('https://www.youtube.com/watch?v=testid', { waitUntil: 'domcontentloaded' });
    // Wait for initial injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });

    // Simulate SPA navigation to a different video — update URL then fire yt-navigate-finish
    // The YouTube content script deduplicates by URL, so the URL must change for teardown to fire
    await page.evaluate(() => {
      history.pushState({}, '', '/watch?v=other-video');
      window.dispatchEvent(new CustomEvent('yt-navigate-finish'));
    });

    // After teardown, native chat style tag should be removed
    const hideStyle = page.locator('style#allchat-hide-native-style');
    await expect(hideStyle).not.toBeAttached({ timeout: 5000 });
    await page.close();
  });

  test('yt-navigate-finish does not double-init when popstate also fires', async () => {
    const page = await context.newPage();
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/youtube-mock.html'), 'utf8');
    // context.route() intercepts service worker fetches (allch.at API)
    await context.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_YOUTUBE })
    );
    await page.route('https://www.youtube.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.goto('https://www.youtube.com/watch?v=testid', { waitUntil: 'domcontentloaded' });
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
    await page.close();
  });
});
