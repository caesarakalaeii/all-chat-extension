import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Manifest Validation', () => {
  let manifest: any;

  test.beforeAll(() => {
    const manifestPath = path.join(__dirname, '..', 'dist', 'manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(manifestContent);
  });

  test('should have valid manifest version 3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  test('should have required fields', () => {
    expect(manifest.name).toBeDefined();
    expect(manifest.version).toBeDefined();
    expect(manifest.description).toBeDefined();
  });

  test('should have service worker defined', () => {
    expect(manifest.background).toBeDefined();
    expect(manifest.background.service_worker).toBeDefined();
    expect(manifest.background.service_worker).toBe('background.js');
  });

  test('should have content scripts defined', () => {
    expect(manifest.content_scripts).toBeDefined();
    expect(Array.isArray(manifest.content_scripts)).toBe(true);
    expect(manifest.content_scripts.length).toBeGreaterThan(0);
  });

  test('should have valid content script matches', () => {
    manifest.content_scripts.forEach((script: any) => {
      expect(script.matches).toBeDefined();
      expect(Array.isArray(script.matches)).toBe(true);
      expect(script.js).toBeDefined();
    });
  });

  test('should have required permissions', () => {
    expect(manifest.permissions).toBeDefined();
    expect(manifest.permissions).toContain('storage');
  });

  test('should have host permissions', () => {
    expect(manifest.host_permissions).toBeDefined();
    expect(Array.isArray(manifest.host_permissions)).toBe(true);
  });

  test('should have web accessible resources', () => {
    expect(manifest.web_accessible_resources).toBeDefined();
    expect(Array.isArray(manifest.web_accessible_resources)).toBe(true);
  });

  test('should have icons defined', () => {
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons['16']).toBeDefined();
    expect(manifest.icons['48']).toBeDefined();
    expect(manifest.icons['128']).toBeDefined();
  });

  test('all referenced files should exist in dist', () => {
    const distPath = path.join(__dirname, '..', 'dist');

    // Check service worker
    const serviceWorkerPath = path.join(distPath, manifest.background.service_worker);
    expect(fs.existsSync(serviceWorkerPath)).toBe(true);

    // Check content scripts
    manifest.content_scripts.forEach((script: any) => {
      script.js.forEach((jsFile: string) => {
        const jsPath = path.join(distPath, jsFile);
        expect(fs.existsSync(jsPath)).toBe(true);
      });

      if (script.css) {
        script.css.forEach((cssFile: string) => {
          const cssPath = path.join(distPath, cssFile);
          expect(fs.existsSync(cssPath)).toBe(true);
        });
      }
    });

    // Check icons
    Object.values(manifest.icons).forEach((iconPath: any) => {
      const fullIconPath = path.join(distPath, iconPath);
      expect(fs.existsSync(fullIconPath)).toBe(true);
    });
  });
});
