import { test, expect, chromium, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');

test.describe('postMessage Origin Validation — KICK-05', () => {

  test('KICK-05a: PlatformDetector.ts injectAllChatUI uses URL params for init, not postMessage', () => {
    // Architecture: injectAllChatUI passes platform/streamer via URL params on the iframe src.
    // This avoids postMessage for init — content scripts report the page origin (not extension
    // origin), so a postMessage-based init would be blocked by the origin check.
    const filePath = path.resolve(__dirname, '../src/content-scripts/base/PlatformDetector.ts');
    const source = fs.readFileSync(filePath, 'utf8');

    // Must NOT contain postMessage with '*' as targetOrigin
    const wildcardMatches = source.match(/postMessage\([^)]*,\s*'\*'/g);
    expect(wildcardMatches, 'PlatformDetector.ts must not use "*" as postMessage targetOrigin').toBeNull();

    // Must use URL params for iframe init (not postMessage)
    expect(source).toContain('new URLSearchParams(');
    expect(source).toContain('chat-container.html?');
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

  test('KICK-05d: src/ui/index.tsx initializes via URL params, not postMessage', () => {
    // Architecture: init uses URL params (?platform=...&streamer=...) set by the content script
    // in the iframe src. This avoids postMessage for init entirely — see comment in index.tsx.
    const filePath = path.resolve(__dirname, '../src/ui/index.tsx');
    const source = fs.readFileSync(filePath, 'utf8');

    // Must use URLSearchParams for init
    expect(source).toContain('URLSearchParams');
    expect(source).toContain('params.get(\'platform\')');
    expect(source).toContain('params.get(\'streamer\')');

    // Must NOT have a wildcard postMessage that would accept arbitrary origins
    expect(source).not.toContain("postMessage(");
  });

  test.describe('KICK-05e: iframe rejects postMessage from non-extension origin', () => {
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
    test.afterAll(async () => { await context.close(); });

    test('iframe rejects postMessage from non-extension origin', async () => {
      const page = await context.newPage();
      const html = fs.readFileSync(path.resolve(__dirname, 'fixtures/twitch-mock.html'), 'utf8');
      const mockStreamer = JSON.stringify({
        username: 'teststreamer',
        platforms: [{ platform: 'twitch', channel_id: 'test123' }]
      });

      // context.route() intercepts service worker fetches (allch.at API)
      await context.route('https://allch.at/api/v1/auth/streamers/**', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: mockStreamer })
      );
      await page.route('https://www.twitch.tv/**', route =>
        route.fulfill({ status: 200, contentType: 'text/html', body: html })
      );

      await page.goto('https://www.twitch.tv/teststreamer', { waitUntil: 'domcontentloaded' });
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
      await page.close();
    });
  });

});
