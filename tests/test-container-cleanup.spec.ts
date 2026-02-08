import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Test to verify that the fix prevents duplicate containers
 * when switching between Twitch streamers
 */
test.describe('Container Cleanup on Streamer Switch', () => {
  test('should not create duplicate containers when URL changes', async ({ page }) => {
    // Enable console logging
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      console.log('PAGE LOG:', text);
    });

    // Step 1: Navigate to first streamer
    console.log('\n=== Testing caesarlp ===');
    await page.goto('https://www.twitch.tv/caesarlp', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    // Check initial state
    const container1Count = await page.locator('#allchat-container').count();
    console.log(`Containers after first load: ${container1Count}`);

    // Step 2: Navigate to second streamer (simulating streamer switch)
    console.log('\n=== Switching to xqc ===');
    await page.goto('https://www.twitch.tv/xqc', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    // Check for duplicate containers
    const container2Count = await page.locator('#allchat-container').count();
    console.log(`Containers after navigation: ${container2Count}`);

    // Step 3: Check logs for the duplicate message
    const hasDuplicateMessage = logs.some(log =>
      log.includes('Found 2 containers') || log.includes('Found') && log.includes('containers')
    );

    console.log('\n=== TEST RESULTS ===');
    console.log(`Duplicate container message found in logs: ${hasDuplicateMessage}`);
    console.log(`Container count after switch: ${container2Count}`);

    // Assertions
    expect(hasDuplicateMessage).toBe(false); // Should NOT see duplicate message
    expect(container2Count).toBeLessThanOrEqual(1); // Should have at most 1 container

    if (hasDuplicateMessage) {
      console.error('❌ BUG STILL EXISTS: Duplicate containers are being created');
    } else {
      console.log('✅ FIX VERIFIED: No duplicate containers created during streamer switch');
    }
  });
});
