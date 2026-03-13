import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const MOCK_STREAMER_TWITCH = JSON.stringify({
  username: 'teststreamer',
  platforms: [{ platform: 'twitch', channel_id: 'test123' }]
});

const MOCK_STREAMER_YOUTUBE = JSON.stringify({
  username: 'teststreamer',
  platforms: [{ platform: 'youtube', channel_id: 'test123' }]
});

test.describe('INJ-01: Twitch iframe mounts in .chat-shell', () => {
  test('allchat-container is a child of .chat-shell', async ({ page }) => {
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/twitch-mock.html'), 'utf8');
    await page.route('https://www.twitch.tv/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_TWITCH })
    );
    await page.goto('https://www.twitch.tv/teststreamer');
    await expect(page.locator('.chat-shell #allchat-container')).toBeAttached({ timeout: 15000 });
  });
});

test.describe('INJ-02: No position:fixed container on Twitch page', () => {
  test('no element with position:fixed exists after injection', async ({ page }) => {
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/twitch-mock.html'), 'utf8');
    await page.route('https://www.twitch.tv/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_TWITCH })
    );
    await page.goto('https://www.twitch.tv/teststreamer');
    const fixed = page.locator('#allchat-container[style*="position: fixed"]');
    await expect(fixed).not.toBeAttached();
  });
});

test.describe('INJ-04: YouTube container inserted before ytd-live-chat-frame', () => {
  test('allchat-container precedes ytd-live-chat-frame in DOM', async ({ page }) => {
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/youtube-mock.html'), 'utf8');
    await page.route('https://www.youtube.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_YOUTUBE })
    );
    await page.goto('https://www.youtube.com/watch?v=testid');
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
  });
});

test.describe('INJ-06: YouTube native chat hidden via style tag', () => {
  test('ytd-live-chat-frame is hidden via injected style tag not inline style', async ({ page }) => {
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/youtube-mock.html'), 'utf8');
    await page.route('https://www.youtube.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_STREAMER_YOUTUBE })
    );
    await page.goto('https://www.youtube.com/watch?v=testid');
    // Wait for injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });
    const styleTag = page.locator('style#allchat-hide-native-style');
    await expect(styleTag).toBeAttached();
    const inlineHidden = page.locator('ytd-live-chat-frame[style*="display: none"]');
    await expect(inlineHidden).not.toBeAttached();
  });
});
