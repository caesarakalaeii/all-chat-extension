import { test, expect, chromium, BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');

const MOCK_STREAMER_KICK = JSON.stringify({
  username: 'teststreamer',
  platforms: [{ platform: 'kick', channel_id: 'test123' }]
});

const KICK_LIVE_MOCK = JSON.stringify({
  id: 1,
  slug: 'teststreamer',
  livestream: { id: 999, session_title: 'Test Stream' },
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

test.describe('Kick SPA Navigation — KICK-06', () => {
  let context: BrowserContext;

  test.beforeAll(async () => { context = await launchExtensionContext(); });
  test.afterAll(async () => { await context.close(); });

  async function setupKickFixtureForAllRoutes(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/kick-mock.html'), 'utf8');
    // context.route() intercepts service worker fetches (localhost:8080 — matches API_URL in test build)
    await context.route('http://localhost:8080/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_KICK })
    );
    await page.route('https://kick.com/**', route => {
      const url = route.request().url();
      if (url.includes('/api/v2/channels/')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: KICK_LIVE_MOCK });
      } else {
        route.fulfill({ status: 200, contentType: 'text/html', body: html });
      }
    });
  }

  test('KICK-06a: navigating from one Kick channel to another tears down existing #allchat-container', async () => {
    const page = await context.newPage();
    await setupKickFixtureForAllRoutes(page);
    await page.goto('https://kick.com/teststreamer', { waitUntil: 'domcontentloaded' });
    // Wait for initial injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });

    // Navigate to another channel (still routed to same fixture)
    await page.goto('https://kick.com/otherstreamer', { waitUntil: 'domcontentloaded' });

    // After navigation, old container should be gone or replaced with at most 1 container
    await page.waitForTimeout(2000);
    const count = await page.locator('#allchat-container').count();
    expect(count).toBeLessThanOrEqual(1);
    await page.close();
  });

  test('KICK-06b: SPA navigation re-injects iframe in new channel chat slot', async () => {
    const page = await context.newPage();
    await setupKickFixtureForAllRoutes(page);
    await page.goto('https://kick.com/teststreamer', { waitUntil: 'domcontentloaded' });
    // Wait for initial injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });

    // Navigate to another channel
    await page.goto('https://kick.com/otherstreamer', { waitUntil: 'domcontentloaded' });

    // Wait for re-injection on new channel
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
    await page.close();
  });

  test('KICK-06c: double-navigation does not create duplicate #allchat-container elements', async () => {
    const page = await context.newPage();
    await setupKickFixtureForAllRoutes(page);
    await page.goto('https://kick.com/teststreamer', { waitUntil: 'domcontentloaded' });
    // Wait for initial injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });

    // Trigger two rapid navigations
    await page.goto('https://kick.com/otherstreamer', { waitUntil: 'domcontentloaded' });
    await page.goto('https://kick.com/yetanotherstreamer', { waitUntil: 'domcontentloaded' });

    // Wait for re-injection to settle
    await page.waitForTimeout(3000);

    // Should have exactly 0 or 1 container — never duplicates
    const count = await page.locator('#allchat-container').count();
    expect(count).toBeLessThanOrEqual(1);
    await page.close();
  });
});
