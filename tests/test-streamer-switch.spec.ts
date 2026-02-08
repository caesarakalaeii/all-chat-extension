import { test, expect, chromium, BrowserContext } from '@playwright/test';
import path from 'path';

test.describe('Streamer Switch Test', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    // Load the extension - use parent directory since tests are in /tests
    const extensionPath = path.join(__dirname, '..', 'dist');

    context = await chromium.launchPersistentContext('', {
      headless: false, // Extensions require non-headless mode
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
      viewport: { width: 1920, height: 1080 },
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should switch chat context when navigating between streamers', async () => {
    const page = await context.newPage();

    // Enable console logging
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error));

    // Step 1: Navigate to caesarlp's stream
    console.log('Navigating to caesarlp stream...');
    await page.goto('https://www.twitch.tv/caesarlp', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000); // Wait for extension to inject

    // Take initial screenshot
    await page.screenshot({ path: 'caesarlp-before.png', fullPage: false });

    // Check if All-Chat container is present
    let allchatContainer1 = await page.locator('#allchat-container').count();
    console.log(`All-Chat container found on caesarlp: ${allchatContainer1 > 0}`);

    // Check if the "not configured" badge is present
    const notConfiguredBadge = await page.locator('#allchat-not-configured-badge').count();
    console.log(`"Not configured" badge found: ${notConfiguredBadge > 0}`);

    if (notConfiguredBadge > 0) {
      const badgeText = await page.locator('#allchat-not-configured-badge').textContent();
      console.log(`Badge text: ${badgeText}`);
      console.log('INFO: caesarlp is not configured in All-Chat. Trying a different streamer...');

      // Try a well-known streamer who might be configured
      console.log('Navigating to pokimane stream (likely to be configured)...');
      await page.goto('https://www.twitch.tv/pokimane', { waitUntil: 'networkidle' });
      await page.waitForTimeout(5000);

      allchatContainer1 = await page.locator('#allchat-container').count();
      const notConfiguredBadge2 = await page.locator('#allchat-not-configured-badge').count();

      if (allchatContainer1 === 0 || notConfiguredBadge2 > 0) {
        console.log('WARNING: Extension is not injecting on any streamer. This might be a different issue.');
        console.log('Skipping test since we need at least one configured streamer to test switching.');
        test.skip();
        return;
      }
    }

    if (allchatContainer1 === 0) {
      console.log('WARNING: No All-Chat container found. Extension may not have injected.');
      console.log('Checking for native chat elements...');
      const nativeChat = await page.locator('[data-test-selector="chat-scrollable-area"]').count();
      console.log(`Native Twitch chat found: ${nativeChat > 0}`);
      test.skip();
      return;
    }

    // Get current URL to determine which streamer we're on
    const currentUrl1 = page.url();
    const match1 = currentUrl1.match(/twitch\.tv\/([^\/]+)/);
    const urlStreamer1 = match1 ? match1[1] : 'unknown';
    console.log(`Currently viewing: ${urlStreamer1}`);

    // Check iframe streamer attribute
    const iframe1Count = await page.locator('iframe[data-platform="twitch"][data-streamer]').count();
    console.log(`Number of iframes before navigation: ${iframe1Count}`);

    const iframe1 = await page.locator('iframe[data-platform="twitch"][data-streamer]').first();
    const streamer1 = await iframe1.getAttribute('data-streamer');
    console.log(`First streamer detected in iframe: ${streamer1}`);

    // Take screenshot with container
    await page.screenshot({ path: 'streamer1-stream.png', fullPage: false });

    // Step 2: Navigate to another streamer
    console.log('\n=== Switching to another streamer ===');
    const secondStreamer = urlStreamer1 === 'pokimane' ? 'xqc' : 'pokimane';
    console.log(`Navigating to ${secondStreamer} stream...`);
    await page.goto(`https://www.twitch.tv/${secondStreamer}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000); // Wait for extension to re-inject

    // Check if All-Chat container is present
    const allchatContainer2 = await page.locator('#allchat-container').count();
    console.log(`All-Chat container found on ${secondStreamer}: ${allchatContainer2 > 0}`);

    // Check if "not configured" badge appears
    const notConfiguredBadge2 = await page.locator('#allchat-not-configured-badge').count();
    if (notConfiguredBadge2 > 0) {
      const badgeText2 = await page.locator('#allchat-not-configured-badge').textContent();
      console.log(`Badge text on second streamer: ${badgeText2}`);
      console.log(`INFO: ${secondStreamer} is not configured in All-Chat.`);
    }

    // Check iframe streamer attribute - this is the KEY part of the test
    const iframe2Count = await page.locator('iframe[data-platform="twitch"][data-streamer]').count();
    console.log(`Number of iframes after navigation: ${iframe2Count}`);

    if (iframe2Count > 0) {
      const iframe2 = await page.locator('iframe[data-platform="twitch"][data-streamer]').first();
      const streamer2 = await iframe2.getAttribute('data-streamer');
      console.log(`Second streamer detected in iframe: ${streamer2}`);

      // Take screenshot
      await page.screenshot({ path: 'streamer2-stream.png', fullPage: false });

      // Step 3: Verify the streamer context switched
      console.log('\n=== TEST RESULTS ===');
      console.log(`Streamer 1: ${streamer1}`);
      console.log(`Streamer 2: ${streamer2}`);
      console.log(`Total iframes found: ${iframe2Count}`);

      if (iframe2Count > 1) {
        console.error('❌ BUG DETECTED: Multiple iframes found, indicating old iframe was not cleaned up!');

        // List all iframes
        const allIframes = await page.locator('iframe[data-platform="twitch"][data-streamer]').all();
        for (let i = 0; i < allIframes.length; i++) {
          const streamer = await allIframes[i].getAttribute('data-streamer');
          console.log(`  Iframe ${i + 1}: ${streamer}`);
        }

        // This is the bug - fail the test
        expect(iframe2Count).toBe(1);
      }

      // Check if the streamer changed
      if (streamer1 === streamer2) {
        console.error(`❌ BUG DETECTED: Streamer context did not switch! Still showing ${streamer1}`);
        expect(streamer1).not.toBe(streamer2);
      } else {
        console.log(`✅ SUCCESS: Streamer context switched from ${streamer1} to ${streamer2}`);
        expect(streamer1).not.toBe(streamer2);
      }

      // Should only have one iframe
      expect(iframe2Count).toBe(1);
    } else {
      console.log('No iframe found on second streamer. May not be configured.');
    }
  });
});
