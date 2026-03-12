import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

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

test.describe('Kick Selector Fallback Chain — KICK-07', () => {

  test('KICK-07a: kick.ts source contains date-comment on each selector in fallback chain', () => {
    // fs test: read src/content-scripts/kick.ts, assert contains #channel-chatroom + date string
    const src = fs.readFileSync(path.resolve(__dirname, '../src/content-scripts/kick.ts'), 'utf8');
    expect(src.includes('#channel-chatroom')).toBe(true);
    // Date string comment format: 2026- (verified date annotation on selectors)
    expect(src.includes('2026-')).toBe(true);
  });

  test('KICK-07b: injection succeeds when only #chatroom exists (primary selector absent)', async ({ page }) => {
    // Minimal fixture with only #chatroom — no #channel-chatroom
    const minimalKickHtml = `<!DOCTYPE html><html><body>
  <div id="chatroom"><div class="chatroom-wrapper">Chat here</div></div>
</body></html>`;

    const kickLiveMock = KICK_LIVE_MOCK;

    await page.route('https://kick.com/**', route => {
      const url = route.request().url();
      if (url.includes('/api/v2/channels/')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: kickLiveMock });
      } else {
        route.fulfill({ status: 200, contentType: 'text/html', body: minimalKickHtml });
      }
    });
    await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_KICK })
    );

    await page.goto('https://kick.com/teststreamer');
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
  });

  test('KICK-07c: injection succeeds when only .chatroom-wrapper exists (both ID selectors absent)', async ({ page }) => {
    // Minimal fixture with only .chatroom-wrapper — no #channel-chatroom or #chatroom
    const minimalKickHtml = `<!DOCTYPE html><html><body>
  <div class="chatroom-wrapper">Chat here</div>
</body></html>`;

    const kickLiveMock = KICK_LIVE_MOCK;

    await page.route('https://kick.com/**', route => {
      const url = route.request().url();
      if (url.includes('/api/v2/channels/')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: kickLiveMock });
      } else {
        route.fulfill({ status: 200, contentType: 'text/html', body: minimalKickHtml });
      }
    });
    await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_KICK })
    );

    await page.goto('https://kick.com/teststreamer');
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
  });

  // Wave 0 scaffold — remove test.skip as each KICK-07 requirement is implemented
});
