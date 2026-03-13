import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: require.resolve('./tests/fixtures/global-setup'),
  globalTeardown: require.resolve('./tests/fixtures/global-teardown'),

  use: {
    trace: 'on-first-retry',
    headless: false,
  },

  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        // Chrome-specific launch options for extensions
        launchOptions: {
          args: [
            `--disable-extensions-except=${path.join(__dirname, 'dist')}`,
            `--load-extension=${path.join(__dirname, 'dist')}`,
            '--disable-blink-features=AutomationControlled',
          ],
        },
      },
    },
  ],
});
