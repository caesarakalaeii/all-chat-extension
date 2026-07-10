/**
 * This file is part of All-Chat Extension.
 * Copyright (C) 2026 caesarakalaeii
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect } from 'vitest';
import { computeBackoffDelay } from '../../src/lib/backoff';

describe('computeBackoffDelay', () => {
  // Pin the jitter to 0 so the deterministic part is testable.
  const noJitter = () => 0;

  it('grows exponentially (1.5^attempts * 1000) before the ceiling', () => {
    expect(computeBackoffDelay(0, noJitter)).toBe(1000);
    expect(computeBackoffDelay(1, noJitter)).toBe(1500);
    expect(computeBackoffDelay(2, noJitter)).toBe(2250);
    expect(computeBackoffDelay(3, noJitter)).toBe(3375);
  });

  it('caps the base delay at 30000ms regardless of attempt count', () => {
    // 1.5^30 * 1000 is far past 30s; large attempt counts must not overflow it.
    expect(computeBackoffDelay(30, noJitter)).toBe(30000);
    expect(computeBackoffDelay(1000, noJitter)).toBe(30000);
  });

  it('adds [0,1000) ms of jitter on top of the (capped) base', () => {
    expect(computeBackoffDelay(0, () => 0.5)).toBe(1500); // 1000 + 500
    expect(computeBackoffDelay(1000, () => 0.999)).toBeCloseTo(30999, 0); // ceiling + jitter
    // Jitter is strictly below 1000ms.
    expect(computeBackoffDelay(0, () => 0.9999)).toBeLessThan(2000);
  });
});
