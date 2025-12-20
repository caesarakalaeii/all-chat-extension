import { test, expect, chromium, BrowserContext, Page } from '@playwright/test';
import path from 'path';

test.describe('Content Scripts', () => {
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

  test('should inject content script on Twitch', async () => {
    const page = await context.newPage();

    // Listen for console messages
    const messages: string[] = [];
    page.on('console', msg => {
      messages.push(msg.text());
    });

    await page.goto('https://www.twitch.tv/', { waitUntil: 'networkidle' });

    // Wait for content script to load
    await page.waitForTimeout(2000);

    // Check if content script loaded
    const hasAllChatMessage = messages.some(msg =>
      msg.includes('[AllChat Twitch]') || msg.includes('AllChat')
    );

    // Log messages for debugging
    console.log('Console messages:', messages.filter(m => m.includes('AllChat')));

    // Check if content script was injected
    const scriptInjected = await page.evaluate(() => {
      return (window as any).__ALLCHAT_LOADED__ === true ||
             document.querySelector('[data-allchat]') !== null;
    });

    expect(scriptInjected || hasAllChatMessage).toBeTruthy();
  });

  test('should inject content script on YouTube', async () => {
    const page = await context.newPage();

    // Listen for console messages
    const messages: string[] = [];
    page.on('console', msg => {
      messages.push(msg.text());
    });

    await page.goto('https://www.youtube.com/', { waitUntil: 'networkidle' });

    // Wait for content script to load
    await page.waitForTimeout(2000);

    // Check if content script loaded
    const hasAllChatMessage = messages.some(msg =>
      msg.includes('[AllChat YouTube]') || msg.includes('AllChat')
    );

    // Log messages for debugging
    console.log('Console messages:', messages.filter(m => m.includes('AllChat')));

    // Check if content script was injected
    const scriptInjected = await page.evaluate(() => {
      return (window as any).__ALLCHAT_LOADED__ === true ||
             document.querySelector('[data-allchat]') !== null;
    });

    expect(scriptInjected || hasAllChatMessage).toBeTruthy();
  });

  test('should not inject content script on non-matching pages', async () => {
    const page = await context.newPage();

    // Listen for console messages
    const messages: string[] = [];
    page.on('console', msg => {
      messages.push(msg.text());
    });

    await page.goto('https://www.google.com/', { waitUntil: 'networkidle' });

    // Wait a bit
    await page.waitForTimeout(1000);

    // Check that content script did NOT load
    const hasAllChatMessage = messages.some(msg =>
      msg.includes('[AllChat') || msg.includes('AllChat')
    );

    expect(hasAllChatMessage).toBeFalsy();
  });
});
