import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Design System — Phase 2', () => {

  test.skip('DS-01: tailwind.config.js deleted and Tailwind 4 in postcss.config.js', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../tailwind.config.js'))).toBe(false);
    const postcss = fs.readFileSync(path.resolve(__dirname, '../postcss.config.js'), 'utf8');
    expect(postcss.includes('@tailwindcss/postcss')).toBe(true);
  });

  test.skip('DS-02: dist/ui/chat-styles.css contains oklch values', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../dist/ui/chat-styles.css'), 'utf8');
    expect(css.includes('oklch(')).toBe(true);
  });

  test.skip('DS-03: chat-styles.css exists and chat-container.html links it', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../dist/ui/chat-styles.css'))).toBe(true);
    const html = fs.readFileSync(path.resolve(__dirname, '../dist/ui/chat-container.html'), 'utf8');
    expect(html.includes('chat-styles.css')).toBe(true);
  });

  // DS-04 needs page fixture — skipped via runtime test.skip()
  test('DS-04: platform page :root has no --color-neutral-* tokens after iframe injection', async ({ page }) => {
    test.skip();
    // Requires built extension + fixture page
    await page.goto('about:blank');
    const token = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-neutral-900')
    );
    expect(token).toBe('');
  });

  // DS-05 needs page fixture — skipped via runtime test.skip()
  test('DS-05: InfinityLogo SVG is visible in chat header inside iframe', async ({ page }) => {
    test.skip();
    // Requires built extension + fixture page
  });

  // DS-06 needs page fixture — skipped via runtime test.skip()
  test('DS-06: Inter font applied to iframe body', async ({ page }) => {
    test.skip();
    // Requires built extension + fixture page
  });

  // DS-07 needs page fixture — skipped via runtime test.skip()
  test('DS-07: platform accent colors match WCAG-AA spec', async ({ page }) => {
    test.skip();
    // Requires built extension
  });

  test.skip('DS-08: autoprefixer removed from postcss.config.js', () => {
    const postcss = fs.readFileSync(path.resolve(__dirname, '../postcss.config.js'), 'utf8');
    expect(postcss.includes('autoprefixer')).toBe(false);
  });

  test.skip('DS-09: tailwind-merge at v3+', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../node_modules/tailwind-merge/package.json'), 'utf8')
    );
    const major = parseInt(pkg.version.split('.')[0], 10);
    expect(major).toBeGreaterThanOrEqual(3);
  });

  // DS-10 needs page fixture — skipped via runtime test.skip()
  test('DS-10: ErrorBoundary shows fallback card on render error', async ({ page }) => {
    test.skip();
    // Requires built extension + error injection
  });

  // Wave 0 scaffold — remove test.skip as each DS requirement is implemented
});
