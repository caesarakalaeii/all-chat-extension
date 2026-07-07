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
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
