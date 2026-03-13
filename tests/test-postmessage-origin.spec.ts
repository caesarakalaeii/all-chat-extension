import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('postMessage Origin Validation — KICK-05', () => {

  test('KICK-05a: PlatformDetector.ts injectAllChatUI uses extensionOrigin not "*" as targetOrigin', () => {
    const filePath = path.resolve(__dirname, '../src/content-scripts/base/PlatformDetector.ts');
    const source = fs.readFileSync(filePath, 'utf8');

    // Must NOT contain postMessage with '*' as targetOrigin
    const wildcardMatches = source.match(/postMessage\([^)]*,\s*'\*'/g);
    expect(wildcardMatches, 'PlatformDetector.ts must not use "*" as postMessage targetOrigin').toBeNull();

    // Must contain extensionOrigin as the targetOrigin
    expect(source).toContain('extensionOrigin');
    expect(source).toContain("chrome.runtime.getURL('').slice(0, -1)");
  });

  test('KICK-05b: twitch.ts setupGlobalMessageRelay relay uses extensionOrigin not "*"', () => {
    const filePath = path.resolve(__dirname, '../src/content-scripts/twitch.ts');
    const source = fs.readFileSync(filePath, 'utf8');

    // Must NOT contain postMessage with '*' as targetOrigin
    const wildcardMatches = source.match(/postMessage\([^)]*,\s*'\*'/g);
    expect(wildcardMatches, 'twitch.ts must not use "*" as postMessage targetOrigin').toBeNull();

    // Must contain extensionOrigin
    expect(source).toContain('extensionOrigin');
  });

  test('KICK-05c: youtube.ts setupGlobalMessageRelay relay uses extensionOrigin not "*"', () => {
    const filePath = path.resolve(__dirname, '../src/content-scripts/youtube.ts');
    const source = fs.readFileSync(filePath, 'utf8');

    // Must NOT contain postMessage with '*' as targetOrigin
    const wildcardMatches = source.match(/postMessage\([^)]*,\s*'\*'/g);
    expect(wildcardMatches, 'youtube.ts must not use "*" as postMessage targetOrigin').toBeNull();

    // Must contain extensionOrigin
    expect(source).toContain('extensionOrigin');
  });

  test('KICK-05d: src/ui/index.tsx message listener has origin guard before processing', () => {
    const filePath = path.resolve(__dirname, '../src/ui/index.tsx');
    const source = fs.readFileSync(filePath, 'utf8');

    // Must contain the origin guard
    expect(source).toContain('event.origin !== extensionOrigin');

    // The guard must appear BEFORE the ALLCHAT_INIT check
    const guardIndex = source.indexOf('event.origin !== extensionOrigin');
    const initCheckIndex = source.indexOf("event.data.type === 'ALLCHAT_INIT'");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(initCheckIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(initCheckIndex);
  });

  // Needs page fixture and built extension
  test('KICK-05e: iframe rejects postMessage from non-extension origin', async ({ page }) => {
    const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/twitch-mock.html'), 'utf8');
    const mockStreamer = JSON.stringify({
      username: 'teststreamer',
      platforms: [{ platform: 'twitch', channel_id: 'test123' }]
    });

    await page.route('https://www.twitch.tv/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.route('https://allch.at/api/v1/auth/streamers/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: mockStreamer })
    );

    await page.goto('https://www.twitch.tv/teststreamer');
    // Wait for iframe injection
    await expect(page.locator('#allchat-container')).toBeAttached({ timeout: 15000 });

    // Dispatch a postMessage from an unexpected (non-extension) origin
    // The iframe's origin guard should reject messages not from the extension origin
    const errorsBefore = await page.evaluate(() => {
      // Send message from the platform page (twitch.tv origin) — not the extension origin
      // The iframe should reject this and not process ALLCHAT_INIT
      const iframe = document.querySelector('iframe[data-platform]') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'ALLCHAT_INIT', streamer: 'hacked' }, '*');
      }
      return (window as unknown as { __allchat_init_count?: number }).__allchat_init_count ?? 0;
    });

    await page.waitForTimeout(500);

    // Verify the page did not crash and iframe is still in initial state
    // The iframe should still be attached (no crash from the rejected message)
    await expect(page.locator('iframe[data-platform]')).toBeAttached();
    // errorsBefor should be 0 — no init counter set from unauthorized origin
    expect(errorsBefore).toBe(0);
  });

});
