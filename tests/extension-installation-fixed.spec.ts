import { test, expect, chromium, BrowserContext } from '@playwright/test';
import path from 'path';

test.describe('Extension Installation (Fixed)', () => {
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

  test('should load the extension', async () => {
    const page = await context.newPage();
    await page.goto('chrome://extensions/');

    // Wait for extensions manager to load
    await page.waitForSelector('extensions-manager', { timeout: 10000 });

    // Extract extension names from shadow DOM
    const extensionNames = await page.evaluate(() => {
      const manager = document.querySelector('extensions-manager');
      if (!manager || !manager.shadowRoot) return [];

      const itemList = manager.shadowRoot.querySelector('extensions-item-list');
      if (!itemList || !itemList.shadowRoot) return [];

      const items = itemList.shadowRoot.querySelectorAll('extensions-item');
      return Array.from(items).map(item => {
        if (!item.shadowRoot) return '';
        const nameElement = item.shadowRoot.querySelector('#name');
        return nameElement?.textContent?.trim() || '';
      });
    });

    console.log('Found extensions:', extensionNames);
    expect(extensionNames).toContain('All-Chat Extension');
  });

  test('should have service worker running', async () => {
    const serviceWorker = context.serviceWorkers()[0];
    expect(serviceWorker).toBeDefined();
  });

  test('should load popup page', async () => {
    const page = await context.newPage();

    // Get extension ID from service worker URL
    const extensionId = await getExtensionId(context);

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await page.waitForSelector('body', { timeout: 5000 });
    const content = await page.content();

    expect(content).toContain('All-Chat');
  });

  test('should have correct extension ID format', async () => {
    const extensionId = await getExtensionId(context);
    // Extension IDs are 32 characters of lowercase letters
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });
});

async function getExtensionId(context: BrowserContext): Promise<string> {
  const serviceWorkers = context.serviceWorkers();
  if (serviceWorkers.length > 0) {
    const url = serviceWorkers[0].url();
    const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
    if (match) return match[1];
  }
  throw new Error('Could not extract extension ID from service worker');
}
