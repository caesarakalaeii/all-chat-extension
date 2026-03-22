import { test, expect, chromium, BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');

const MOCK_STREAMER_KICK = JSON.stringify({
  username: 'teststreamer',
  platforms: [{ platform: 'kick', channel_id: 'test123' }]
});

// Kick API live mock — non-null livestream signals live channel
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

async function setupKickRoutes(context: BrowserContext, page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
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

test.describe('Kick Injection — KICK-02', () => {
  let context: BrowserContext;

  test.beforeAll(async () => { context = await launchExtensionContext(); });
  test.afterAll(async () => { await context.close(); });

  test('KICK-02a: #allchat-container appears inside #channel-chatroom on live Kick page', async () => {
    const page = await context.newPage();
    await setupKickRoutes(context, page);
    await page.goto('https://kick.com/teststreamer', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#channel-chatroom #allchat-container')).toBeAttached({ timeout: 15000 });
    await page.close();
  });

  test('KICK-02b: native Kick chat hidden via injected style tag with id allchat-hide-native-style', async () => {
    const page = await context.newPage();
    await setupKickRoutes(context, page);
    await page.goto('https://kick.com/teststreamer', { waitUntil: 'domcontentloaded' });
    // Wait for injection first
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
    await expect(page.locator('style#allchat-hide-native-style')).toBeAttached();
    await page.close();
  });

  test('KICK-02c: iframe inside #allchat-container has data-platform="kick"', async () => {
    const page = await context.newPage();
    await setupKickRoutes(context, page);
    await page.goto('https://kick.com/teststreamer', { waitUntil: 'domcontentloaded' });
    // Wait for injection first
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
    // data-platform is on the iframe element in the outer page DOM
    await expect(page.locator('iframe[data-platform="kick"]')).toBeAttached({ timeout: 10000 });
    await page.close();
  });
});
