import { test, expect, chromium, BrowserContext } from '@playwright/test';
import fs from 'fs';
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
  // Task 1: Type-level tests (fs-based, no browser needed)
  test('SyncStorage type has platformEnabled field', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/types/extension.ts'),
      'utf8'
    );
    expect(src).toContain('platformEnabled: PlatformEnabled');
  });

  test('SyncStorage type does NOT have extensionEnabled field', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/types/extension.ts'),
      'utf8'
    );
    // Should not contain extensionEnabled as a type field
    expect(src).not.toMatch(/extensionEnabled:\s*boolean/);
  });

  test('PlatformEnabled type is exported with twitch, youtube, kick booleans', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/types/extension.ts'),
      'utf8'
    );
    expect(src).toContain('export type PlatformEnabled');
    expect(src).toContain('twitch: boolean');
    expect(src).toContain('youtube: boolean');
    expect(src).toContain('kick: boolean');
  });

  test('DEFAULT_SETTINGS has platformEnabled with all three platforms true', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/types/extension.ts'),
      'utf8'
    );
    expect(src).toContain('platformEnabled');
    // All three platforms default to true
    const defaultSection = src.slice(src.indexOf('DEFAULT_SETTINGS'));
    expect(defaultSection).toContain('twitch: true');
    expect(defaultSection).toContain('youtube: true');
    expect(defaultSection).toContain('kick: true');
  });

  test('DEFAULT_SETTINGS does NOT have extensionEnabled key', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/types/extension.ts'),
      'utf8'
    );
    const defaultSection = src.slice(src.indexOf('DEFAULT_SETTINGS'));
    expect(defaultSection).not.toContain('extensionEnabled');
  });

  test('ExtensionMessage union includes EXTENSION_STATE_CHANGED', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/types/extension.ts'),
      'utf8'
    );
    expect(src).toContain('EXTENSION_STATE_CHANGED');
  });

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
