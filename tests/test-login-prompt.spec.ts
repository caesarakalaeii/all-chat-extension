/**
 * Login Prompt Visibility Tests
 *
 * Regression tests for the login prompt on Twitch.
 * Uses real Twitch page (not mocked) with production build hitting allch.at API.
 *
 * Covers:
 * - Fresh state: login prompt visible when no token stored
 * - Expired token: login prompt visible after auto-clearing expired JWT
 * - Valid token: message input visible (login prompt hidden)
 */

import { test, expect, chromium, BrowserContext } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');

// Helper to create a fake JWT with a given expiry offset (seconds from now)
function makeFakeJwt(expiryOffsetSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ sub: 'test', exp: Math.floor(Date.now() / 1000) + expiryOffsetSeconds })
  );
  return `${header}.${payload}.fakesignature`;
}

test.describe('Login prompt visibility', () => {
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

  test.afterAll(async () => {
    await context?.close();
  });

  test('shows login prompt on Twitch when no token stored', async () => {
    const page = await context.newPage();

    await page.goto('https://www.twitch.tv/PaPaJDub', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const frame = page.frameLocator('#allchat-container iframe');
    const loginButton = frame.locator('button:has-text("Login with Twitch")');
    await expect(loginButton).toBeVisible({ timeout: 30000 });

    await page.close();
  });

  test('shows login prompt when expired JWT is stored', async () => {
    const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');

    // Store an expired JWT (expired 1 hour ago)
    await sw.evaluate((token: string) => {
      return new Promise<void>((resolve) => {
        (globalThis as any).chrome.storage.local.set(
          {
            viewer_jwt_token: token,
            viewer_info: { username: 'testuser', display_name: 'TestUser', platform: 'twitch' },
            ui_collapsed: false,
          },
          () => resolve()
        );
      });
    }, makeFakeJwt(-3600));

    const page = await context.newPage();

    await page.goto('https://www.twitch.tv/PaPaJDub', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const frame = page.frameLocator('#allchat-container iframe');

    // Expired token should be cleared -> login prompt should show
    const loginButton = frame.locator('button:has-text("Login with Twitch")');
    await expect(loginButton).toBeVisible({ timeout: 30000 });

    // Message send button should NOT be visible
    const sendButton = frame.locator('button:has-text("Send")');
    await expect(sendButton).not.toBeVisible();

    // Clean up
    await sw.evaluate(() => {
      return new Promise<void>((resolve) => {
        (globalThis as any).chrome.storage.local.remove(
          ['viewer_jwt_token', 'viewer_info'],
          () => resolve()
        );
      });
    });

    await page.close();
  });

  test('shows message input when valid JWT is stored', async () => {
    const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');

    // Store a valid JWT (expires in 1 hour)
    await sw.evaluate((token: string) => {
      return new Promise<void>((resolve) => {
        (globalThis as any).chrome.storage.local.set(
          {
            viewer_jwt_token: token,
            viewer_info: { username: 'testuser', display_name: 'TestUser', platform: 'twitch' },
            ui_collapsed: false,
          },
          () => resolve()
        );
      });
    }, makeFakeJwt(3600));

    const page = await context.newPage();

    await page.goto('https://www.twitch.tv/PaPaJDub', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const frame = page.frameLocator('#allchat-container iframe');

    // Valid token -> should NOT show login prompt
    const loginButton = frame.locator('button:has-text("Login with Twitch")');
    await expect(loginButton).not.toBeVisible({ timeout: 15000 });

    // Clean up
    await sw.evaluate(() => {
      return new Promise<void>((resolve) => {
        (globalThis as any).chrome.storage.local.remove(
          ['viewer_jwt_token', 'viewer_info'],
          () => resolve()
        );
      });
    });

    await page.close();
  });
});
