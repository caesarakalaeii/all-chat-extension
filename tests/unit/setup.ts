import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount anything rendered by @testing-library/react between tests so DOM state
// (and React trees) never leak from one test into the next.
afterEach(() => {
  cleanup();
});
