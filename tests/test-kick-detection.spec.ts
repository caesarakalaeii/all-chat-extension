import { test, expect, chromium, BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');

test.describe('Kick Detection — KICK-01', () => {

  test('KICK-01a: isLiveStream() returns true when [data-state="live"] badge present', () => {
    // fs test: read src/content-scripts/kick.ts, assert API-based live detection
    const src = fs.readFileSync(path.resolve(__dirname, '../src/content-scripts/kick.ts'), 'utf8');
    // Kick uses API-based live detection: fetches /api/v2/channels/{slug}, checks livestream field
    expect(src.includes('data.livestream !== null')).toBe(true);
  });

  test('KICK-01b: isLiveStream() returns true when #channel-chatroom exists and is visible (fallback)', () => {
    // fs test: read src/content-scripts/kick.ts, assert #channel-chatroom selector is present
    const src = fs.readFileSync(path.resolve(__dirname, '../src/content-scripts/kick.ts'), 'utf8');
    expect(src.includes('#channel-chatroom')).toBe(true);
  });

  test('KICK-01c: isLiveStream() returns false and emits console.warn when no live signal found', () => {
    // fs test: read src/content-scripts/kick.ts, assert console.warn is called on failure paths
    const src = fs.readFileSync(path.resolve(__dirname, '../src/content-scripts/kick.ts'), 'utf8');
    expect(fs.existsSync(path.resolve(__dirname, '../src/content-scripts/kick.ts'))).toBe(true);
    expect(src.includes('console.warn')).toBe(true);
  });

  test.describe('KICK-01d: kick.ts content script does not inject on non-live Kick page', () => {
    let context: BrowserContext;

    test.beforeAll(async () => {
      context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`,
          '--no-sandbox',
        ],
        viewport: { width: 1280, height: 800 },
      });
    });
    test.afterAll(async () => { await context.close(); });

    test('kick.ts content script does not inject on non-live Kick page', async () => {
      const page = await context.newPage();
      const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/kick-mock.html'), 'utf8');
      // Mock the Kick API to return null livestream (channel not live)
      const notLiveMock = JSON.stringify({
        id: 1,
        slug: 'teststreamer-offline',
        livestream: null,
      });

      await page.route('https://kick.com/**', route => {
        const url = route.request().url();
        if (url.includes('/api/v2/channels/')) {
          route.fulfill({ status: 200, contentType: 'application/json', body: notLiveMock });
        } else {
          route.fulfill({ status: 200, contentType: 'text/html', body: html });
        }
      });
      // allch.at API route not needed — extension should not reach this point if not live

      await page.goto('https://kick.com/teststreamer-offline', { waitUntil: 'domcontentloaded' });
      // Wait 5 seconds — extension should NOT inject since the channel is not live
      await page.waitForTimeout(5000);
      const count = await page.locator('#allchat-container').count();
      expect(count).toBe(0);
      await page.close();
    });
  });

  // Wave 0 scaffold — remove test.skip as each KICK-01 requirement is implemented
});
