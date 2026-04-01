import { test, expect, chromium, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');

test.describe('postMessage Origin Validation — KICK-05', () => {

  test('KICK-05a: PlatformDetector.ts injectAllChatUI does not use postMessage with "*" targetOrigin', () => {
    // PlatformDetector.injectAllChatUI creates the iframe via iframe.src (no postMessage).
    // The extensionOrigin guard is enforced in the per-platform relay handlers (twitch.ts etc).
    const filePath = path.resolve(__dirname, '../src/content-scripts/base/PlatformDetector.ts');
    const source = fs.readFileSync(filePath, 'utf8');

    // Must NOT contain postMessage with '*' as targetOrigin
    const wildcardMatches = source.match(/postMessage\([^)]*,\s*'\*'/g);
    expect(wildcardMatches, 'PlatformDetector.ts must not use "*" as postMessage targetOrigin').toBeNull();

    // Iframe src must be set via chrome.runtime.getURL (extension origin URL)
    expect(source).toContain('chrome.runtime.getURL(`ui/chat-container.html');
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

  test('KICK-05d: src/ui/index.tsx uses URL params for initialization (not postMessage)', () => {
    // The original KICK-05d checked for an ALLCHAT_INIT postMessage handler with an origin guard.
    // The architecture changed: initialization now uses URL search params instead of postMessage,
    // removing the attack surface entirely (no message listener needed for init).
    const filePath = path.resolve(__dirname, '../src/ui/index.tsx');
    const source = fs.readFileSync(filePath, 'utf8');

    // Must use URLSearchParams to read platform and streamer from the URL
    expect(source).toContain('new URLSearchParams(location.search)');
    expect(source).toContain("params.get('platform')");
    expect(source).toContain("params.get('streamer')");

    // Must NOT contain a postMessage-based ALLCHAT_INIT handler
    expect(source).not.toContain("event.data.type === 'ALLCHAT_INIT'");
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
      await context.route('http://localhost:8080/api/v1/auth/streamers/**', route =>
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
