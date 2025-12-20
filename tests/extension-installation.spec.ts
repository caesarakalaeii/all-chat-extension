import { test, expect, chromium, BrowserContext } from '@playwright/test';
import path from 'path';

test.describe('Extension Installation', () => {
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

    const pageContent = await page.content();
    expect(pageContent).toContain('All-Chat Extension');
  });

  test('should have service worker running', async () => {
    const serviceWorker = context.serviceWorkers()[0];
    expect(serviceWorker).toBeDefined();
  });

  test('should load popup page', async () => {
    const page = await context.newPage();
    const extensionId = await getExtensionId(page);

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await page.waitForSelector('body', { timeout: 5000 });
    const content = await page.content();

    expect(content).toContain('All-Chat');
  });
});

async function getExtensionId(page: any): Promise<string> {
  await page.goto('chrome://extensions/');
  await page.evaluate(() => {
    const manager = document.querySelector('extensions-manager');
    if (manager) {
      (manager as any).shadowRoot.querySelector('#viewManager > extensions-item-list')
        .shadowRoot.querySelector('#container');
    }
  });

  const extensionDataElements = await page.$$('extensions-item');

  for (const element of extensionDataElements) {
    const name = await element.evaluate((el: any) => {
      return el.shadowRoot.querySelector('#name-and-version')?.textContent || '';
    });

    if (name.includes('All-Chat')) {
      const extensionId = await element.evaluate((el: any) => el.id);
      return extensionId;
    }
  }

  throw new Error('Extension not found');
}
