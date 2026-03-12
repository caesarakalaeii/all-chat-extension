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

  // Needs page fixture and built extension — skipped via runtime test.skip()
  test('KICK-05e: iframe rejects postMessage from non-extension origin', async ({ page }) => {
    test.skip();
    // Requires built extension + fixture page
    // Implementation pending
  });

});
