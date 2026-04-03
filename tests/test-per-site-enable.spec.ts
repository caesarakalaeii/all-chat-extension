import { test, expect, chromium, BrowserContext } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, '../dist');

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

test.describe('Per-site enable/disable @phase5', () => {
  test.skip('popup shows three platform toggle rows', async () => {
    // D-03: Three per-platform toggles in popup
  });

  test.skip('disabling a platform prevents injection', async () => {
    // D-04: Toggle takes effect immediately
  });

  test.skip('re-enabling a platform restores injection without reload', async () => {
    // D-04: No page reload on re-enable
  });

  test.skip('disabling one platform does not affect another', async () => {
    // D-01: Per-platform granularity
  });

  test.skip('current platform row is highlighted in popup', async () => {
    // D-05: Active row highlight
  });

  test.skip('default: all platforms enabled on fresh storage', async () => {
    // D-06: All three platforms enabled by default
  });

  test.skip('toolbar icon is grayscale when platform is disabled', async () => {
    // D-07, D-08: Grayscale icon feedback
  });
});
