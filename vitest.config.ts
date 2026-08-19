import { defineConfig } from 'vitest/config';

/**
 * Unit/component test harness (jsdom + @testing-library/react).
 *
 * Complements the Playwright suite in tests/*.spec.ts, which exercises the packed
 * extension end-to-end in a real browser but cannot reach the pure logic in the
 * engagement hook/panel (a live round needs a running engagement-service). These
 * fast unit tests cover that behavior. Playwright is scoped away from tests/unit via
 * testIgnore so the two runners never collide.
 */

// Vitest normally sets NODE_ENV=test, but an ambient NODE_ENV=production (as in
// some CI images and container dev shells) wins over that default. React then
// resolves to its production build, where ReactDOMTestUtils.act is stripped, and
// every @testing-library/react render throws "Cannot read properties of
// undefined" from react.production.min.js. Force it back before Vite reads the
// config so the resolution conditions are the development ones the tests need.
process.env.NODE_ENV = 'test';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
