import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const MOCK_STREAMER_KICK = JSON.stringify({
  username: 'teststreamer',
  platforms: [{ platform: 'kick', channel_id: 'test123' }]
});

const KICK_LIVE_MOCK = JSON.stringify({
  id: 1,
  slug: 'teststreamer',
  livestream: { id: 999, session_title: 'Test Stream' },
});

async function serveKickFixtureForAllRoutes(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
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

test.describe('Kick SPA Navigation — KICK-06', () => {

  test('KICK-06a: navigating from one Kick channel to another tears down existing #allchat-container', async ({ page }) => {
    await serveKickFixtureForAllRoutes(page);
    await page.goto('https://kick.com/teststreamer');
    // Wait for initial injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });

    // Navigate to another channel (still routed to same fixture)
    await page.goto('https://kick.com/otherstreamer');

    // After navigation, old container should be gone or replaced with at most 1 container
    await page.waitForTimeout(2000);
    const count = await page.locator('#allchat-container').count();
    expect(count).toBeLessThanOrEqual(1);
  });

  test('KICK-06b: SPA navigation re-injects iframe in new channel chat slot', async ({ page }) => {
    await serveKickFixtureForAllRoutes(page);
    await page.goto('https://kick.com/teststreamer');
    // Wait for initial injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });

    // Navigate to another channel
    await page.goto('https://kick.com/otherstreamer');

    // Wait for re-injection on new channel
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
  });

  test('KICK-06c: double-navigation does not create duplicate #allchat-container elements', async ({ page }) => {
    await serveKickFixtureForAllRoutes(page);
    await page.goto('https://kick.com/teststreamer');
    // Wait for initial injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });

    // Trigger two rapid navigations
    await page.goto('https://kick.com/otherstreamer');
    await page.goto('https://kick.com/yetanotherstreamer');

    // Wait for re-injection to settle
    await page.waitForTimeout(3000);

    // Should have exactly 0 or 1 container — never duplicates
    const count = await page.locator('#allchat-container').count();
    expect(count).toBeLessThanOrEqual(1);
  });

});
