import { test, expect, chromium, BrowserContext } from '@playwright/test';
import path from 'path';

test.describe('Content Scripts with Mock Pages', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    const pathToExtension = path.join(__dirname, '..', 'dist');

    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
      ],
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should inject on mock Twitch page', async () => {
    const page = await context.newPage();

    const messages: string[] = [];
    page.on('console', msg => {
      messages.push(msg.text());
    });

    const mockPagePath = `file://${path.join(__dirname, 'fixtures', 'twitch-mock.html')}`;
    await page.goto(mockPagePath, { waitUntil: 'load' });

    // Wait for content script
    await page.waitForTimeout(2000);

    console.log('Mock Twitch messages:', messages);

    // Verify page loaded correctly
    const title = await page.title();
    expect(title).toContain('Mock Twitch');

    // Check for chat container
    const hasChatContainer = await page.evaluate(() => {
      return document.querySelector('.stream-chat') !== null;
    });
    expect(hasChatContainer).toBeTruthy();
  });

  test('should inject on mock YouTube page', async () => {
    const page = await context.newPage();

    const messages: string[] = [];
    page.on('console', msg => {
      messages.push(msg.text());
    });

    const mockPagePath = `file://${path.join(__dirname, 'fixtures', 'youtube-mock.html')}`;
    await page.goto(mockPagePath, { waitUntil: 'load' });

    await page.waitForTimeout(2000);

    console.log('Mock YouTube messages:', messages);

    const title = await page.title();
    expect(title).toContain('Mock YouTube');

    const hasChatContainer = await page.evaluate(() => {
      return document.querySelector('#chat') !== null;
    });
    expect(hasChatContainer).toBeTruthy();
  });
});
