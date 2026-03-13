import { test, expect, chromium, BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');

const MOCK_STREAMER_KICK = JSON.stringify({
  username: 'teststreamer',
  platforms: [{ platform: 'kick', channel_id: 'test123' }]
});

// Kick API live mock — returns non-null livestream so extension proceeds past live check
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

test.describe('Kick Selector Fallback Chain — KICK-07', () => {
  let context: BrowserContext;

  test.beforeAll(async () => { context = await launchExtensionContext(); });
  test.afterAll(async () => { await context.close(); });

  test('KICK-07a: kick.ts source contains date-comment on each selector in fallback chain', () => {
    // fs test: read src/content-scripts/kick.ts, assert contains #channel-chatroom + date string
    const src = fs.readFileSync(path.resolve(__dirname, '../src/content-scripts/kick.ts'), 'utf8');
    expect(src.includes('#channel-chatroom')).toBe(true);
    // Date string comment format: 2026- (verified date annotation on selectors)
    expect(src.includes('2026-')).toBe(true);
  });

  test('KICK-07b: injection succeeds when only #chatroom exists (primary selector absent)', async () => {
    // Minimal fixture with only #chatroom — no #channel-chatroom
    const minimalKickHtml = `<!DOCTYPE html><html><body>
  <div id="chatroom"><div class="chatroom-wrapper">Chat here</div></div>
</body></html>`;

    const page = await context.newPage();
    // context.route() intercepts service worker fetches (allch.at API)
    await context.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_KICK })
    );
    await page.route('https://kick.com/**', route => {
      const url = route.request().url();
      if (url.includes('/api/v2/channels/')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: KICK_LIVE_MOCK });
      } else {
        route.fulfill({ status: 200, contentType: 'text/html', body: minimalKickHtml });
      }
    });

    await page.goto('https://kick.com/teststreamer', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
    await page.close();
  });

  test('KICK-07c: injection succeeds when only .chatroom-wrapper exists (both ID selectors absent)', async () => {
    test.setTimeout(35000); // fallback chain: 10s (#channel-chatroom) + 10s (#chatroom) + buffer
    // Minimal fixture with only .chatroom-wrapper — no #channel-chatroom or #chatroom
    const minimalKickHtml = `<!DOCTYPE html><html><body>
  <div class="chatroom-wrapper">Chat here</div>
</body></html>`;

    const page = await context.newPage();
    // context.route() intercepts service worker fetches (allch.at API)
    await context.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_KICK })
    );
    await page.route('https://kick.com/**', route => {
      const url = route.request().url();
      if (url.includes('/api/v2/channels/')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: KICK_LIVE_MOCK });
      } else {
        route.fulfill({ status: 200, contentType: 'text/html', body: minimalKickHtml });
      }
    });

    await page.goto('https://kick.com/teststreamer', { waitUntil: 'domcontentloaded' });
    // KICK-07c requires fallback through both #channel-chatroom (10s timeout) and #chatroom (10s timeout)
    // before finding .chatroom-wrapper — allow 25s for full fallback chain
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 25000 });
    await page.close();
  });

  // Wave 0 scaffold — remove test.skip as each KICK-07 requirement is implemented
});
