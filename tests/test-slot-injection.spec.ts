import { test, expect, chromium, BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');

const MOCK_STREAMER_TWITCH = JSON.stringify({
  username: 'teststreamer',
  platforms: [{ platform: 'twitch', channel_id: 'test123' }]
});

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

test.describe('INJ-01: Twitch iframe mounts in .chat-shell', () => {
  let context: BrowserContext;

  test.beforeAll(async () => { context = await launchExtensionContext(); });
  test.afterAll(async () => { await context.close(); });

  test('allchat-container is a child of .chat-shell', async () => {
    const page = await context.newPage();
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/twitch-mock.html'), 'utf8');
    await context.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_TWITCH })
    );
    await page.route('https://www.twitch.tv/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.goto('https://www.twitch.tv/teststreamer', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.chat-shell #allchat-container')).toBeAttached({ timeout: 15000 });
    await page.close();
  });
});

test.describe('INJ-02: No position:fixed container on Twitch page', () => {
  let context: BrowserContext;

  test.beforeAll(async () => { context = await launchExtensionContext(); });
  test.afterAll(async () => { await context.close(); });

  test('no element with position:fixed exists after injection', async () => {
    const page = await context.newPage();
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/twitch-mock.html'), 'utf8');
    await context.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_TWITCH })
    );
    await page.route('https://www.twitch.tv/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.goto('https://www.twitch.tv/teststreamer', { waitUntil: 'domcontentloaded' });
    // Wait for injection first
    await expect(page.locator('.chat-shell #allchat-container')).toBeAttached({ timeout: 15000 });
    const fixed = page.locator('#allchat-container[style*="position: fixed"]');
    await expect(fixed).not.toBeAttached();
    await page.close();
  });
});

test.describe('INJ-04: YouTube container inserted before ytd-live-chat-frame', () => {
  let context: BrowserContext;

  test.beforeAll(async () => { context = await launchExtensionContext(); });
  test.afterAll(async () => { await context.close(); });

  test('allchat-container precedes ytd-live-chat-frame in DOM', async () => {
    const page = await context.newPage();
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/youtube-mock.html'), 'utf8');
    await context.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_YOUTUBE })
    );
    await page.route('https://www.youtube.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.goto('https://www.youtube.com/watch?v=testid', { waitUntil: 'domcontentloaded' });
    // Wait for injection first
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
    const order = await page.evaluate(() => {
      const container = document.getElementById('allchat-container');
      const native = document.querySelector('ytd-live-chat-frame');
      if (!container || !native) return null;
      const pos = container.compareDocumentPosition(native);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(order).toBe(true);
    await page.close();
  });
});

test.describe('INJ-06: YouTube native chat hidden via style tag', () => {
  let context: BrowserContext;

  test.beforeAll(async () => { context = await launchExtensionContext(); });
  test.afterAll(async () => { await context.close(); });

  test('ytd-live-chat-frame is hidden via injected style tag not inline style', async () => {
    const page = await context.newPage();
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/youtube-mock.html'), 'utf8');
    await context.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_YOUTUBE })
    );
    await page.route('https://www.youtube.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.goto('https://www.youtube.com/watch?v=testid', { waitUntil: 'domcontentloaded' });
    // Wait for injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
    const styleTag = page.locator('style#allchat-hide-native-style');
    await expect(styleTag).toBeAttached();
    const inlineHidden = page.locator('ytd-live-chat-frame[style*="display: none"]');
    await expect(inlineHidden).not.toBeAttached();
    await page.close();
  });
});
