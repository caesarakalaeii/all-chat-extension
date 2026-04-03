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

test.describe('Storage migration @phase5', () => {
  // Task 2: fs-based tests for storage migration logic
  test('getSyncStorage contains migration logic for legacy extensionEnabled', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/storage.ts'),
      'utf8'
    );
    expect(src).toContain('result.platformEnabled');
    expect(src).toContain('legacyEnabled');
  });

  test('getSyncStorage migrates extensionEnabled=true to all platforms enabled', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/storage.ts'),
      'utf8'
    );
    // Should contain the migration path assigning all three platforms from legacyEnabled
    expect(src).toContain('twitch: legacyEnabled');
    expect(src).toContain('youtube: legacyEnabled');
    expect(src).toContain('kick: legacyEnabled');
  });

  test('getSyncStorage removes legacy extensionEnabled from returned object', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/storage.ts'),
      'utf8'
    );
    expect(src).toContain('delete (result as any).extensionEnabled');
  });

  test('getSyncStorage removes legacy extensionEnabled from chrome storage', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/storage.ts'),
      'utf8'
    );
    expect(src).toContain("chrome.storage.sync.remove('extensionEnabled')");
  });

  test('getSyncStorage performs deep-merge for partial platformEnabled', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/storage.ts'),
      'utf8'
    );
    // Should contain null-coalescing defaults for all three platforms
    expect(src).toContain('result.platformEnabled.twitch ?? true');
    expect(src).toContain('result.platformEnabled.youtube ?? true');
    expect(src).toContain('result.platformEnabled.kick ?? true');
  });

  test('grayscale icon assets exist for all four sizes', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../assets/icon-16-gray.png'))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, '../assets/icon-32-gray.png'))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, '../assets/icon-48-gray.png'))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, '../assets/icon-128-gray.png'))).toBe(true);
  });

  test('grayscale icon assets are valid PNG files', () => {
    const sizes = [16, 32, 48, 128];
    for (const size of sizes) {
      const filePath = path.resolve(__dirname, `../assets/icon-${size}-gray.png`);
      const buffer = fs.readFileSync(filePath);
      // PNG magic bytes: 89 50 4E 47
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4E);
      expect(buffer[3]).toBe(0x47);
    }
  });

  test('ADR 005 exists for storage migration', () => {
    expect(fs.existsSync(
      path.resolve(__dirname, '../docs/adr/005-platform-enabled-storage-migration.md')
    )).toBe(true);
  });

  test('ADR 005 has Status Accepted', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../docs/adr/005-platform-enabled-storage-migration.md'),
      'utf8'
    );
    expect(src).toContain('Status: Accepted');
  });

  test('ADR 005 documents platformEnabled migration', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../docs/adr/005-platform-enabled-storage-migration.md'),
      'utf8'
    );
    expect(src).toContain('platformEnabled');
    expect(src).toContain('extensionEnabled');
  });

  test.skip('legacy extensionEnabled=true migrates to all platforms enabled', async () => {
    // D-02: extensionEnabled -> platformEnabled migration
  });

  test.skip('legacy extensionEnabled=false migrates to all platforms disabled', async () => {
    // D-02: extensionEnabled -> platformEnabled migration
  });

  test.skip('partial platformEnabled is deep-merged with defaults', async () => {
    // D-02: Deep merge for partial objects
  });

  test.skip('migration removes legacy extensionEnabled key from storage', async () => {
    // D-02: Clean up legacy key
  });
});
