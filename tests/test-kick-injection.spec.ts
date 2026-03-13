import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

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

async function serveKickFixture(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/kick-mock.html'), 'utf8');
  await page.route('https://kick.com/**', route => {
    const url = route.request().url();
    if (url.includes('/api/v2/channels/')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: KICK_LIVE_MOCK });
    } else {
      route.fulfill({ status: 200, contentType: 'text/html', body: html });
    }
  });
  await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_KICK })
  );
}

test.describe('Kick Injection — KICK-02', () => {

  test('KICK-02a: #allchat-container appears inside #channel-chatroom on live Kick page', async ({ page }) => {
    await serveKickFixture(page);
    await page.goto('https://kick.com/teststreamer');
    await expect(page.locator('#channel-chatroom #allchat-container')).toBeAttached({ timeout: 15000 });
  });

  test('KICK-02b: native Kick chat hidden via injected style tag with id allchat-hide-native-style', async ({ page }) => {
    await serveKickFixture(page);
    await page.goto('https://kick.com/teststreamer');
    // Wait for injection first
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
    await expect(page.locator('style#allchat-hide-native-style')).toBeAttached();
  });

  test('KICK-02c: iframe inside #allchat-container has data-platform="kick"', async ({ page }) => {
    await serveKickFixture(page);
    await page.goto('https://kick.com/teststreamer');
    // Wait for injection first
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
    // data-platform is on the iframe element in the outer page DOM
    await expect(page.locator('iframe[data-platform="kick"]')).toBeAttached({ timeout: 10000 });
  });

});
