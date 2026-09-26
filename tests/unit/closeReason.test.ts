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
import {
  decideCloseAction,
  isApplicationCloseCode,
  type StreamerProbeResult,
} from '../../src/lib/closeReason';

describe('isApplicationCloseCode', () => {
  it('covers exactly the 4000-4999 application range', () => {
    expect(isApplicationCloseCode(4000)).toBe(true);
    expect(isApplicationCloseCode(4403)).toBe(true);
    expect(isApplicationCloseCode(4999)).toBe(true);

    expect(isApplicationCloseCode(3999)).toBe(false);
    expect(isApplicationCloseCode(5000)).toBe(false);
    expect(isApplicationCloseCode(1006)).toBe(false);
  });
});

describe('decideCloseAction', () => {
  // The regression this whole module exists for. A gateway rolling mid-connect,
  // a cold-start proxy, DNS, TLS — all surface as 1006 with an empty reason,
  // identical to a policy rejection. The old heuristic (1006 on attempt 0)
  // matched every one of them and silenced the extension until a manual reset.
  it('retries a 1006 when the streamer is still reachable', () => {
    expect(decideCloseAction(1006, 'reachable')).toBe('retry');
  });

  it('stops on a 1006 when the probe says the overlay is not public', () => {
    expect(decideCloseAction(1006, 'not-public')).toBe('stop');
  });

  // A 5xx, a timeout, or an unparseable body says nothing about whether the
  // overlay is public. Treating it as a denial reintroduces the original bug
  // through the back door.
  it('retries a 1006 when the probe itself failed', () => {
    expect(decideCloseAction(1006, 'unreachable')).toBe('retry');
  });

  // 4000-4999 is the application range: the gateway deliberately saying
  // something about this connection. That is the one close we take at face
  // value, without an HTTP probe.
  it('stops on an application close code whatever the probe says', () => {
    const probes: (StreamerProbeResult | undefined)[] = [
      'reachable',
      'not-public',
      'unreachable',
      undefined,
    ];
    for (const probe of probes) {
      expect(decideCloseAction(4403, probe)).toBe('stop');
      expect(decideCloseAction(4000, probe)).toBe('stop');
      expect(decideCloseAction(4999, probe)).toBe('stop');
    }
  });

  // 1001 is what a pod says on its way out during a rolling deploy, and 1000 is
  // an ordinary server-side close. Reconnecting is exactly the point.
  it('retries a clean 1000 / 1001 when the streamer is reachable', () => {
    expect(decideCloseAction(1000, 'reachable')).toBe('retry');
    expect(decideCloseAction(1001, 'reachable')).toBe('retry');
  });

  it('still stops on a clean close if the overlay went non-public', () => {
    // e.g. the streamer flipped "Public for Viewers" off and the gateway
    // dropped the connection normally.
    expect(decideCloseAction(1000, 'not-public')).toBe('stop');
    expect(decideCloseAction(1001, 'not-public')).toBe('stop');
  });

  // Absent probe result means no policy answer arrived, not a denial: an older
  // gateway with no viewer_public field lands here, and it must keep retrying.
  it('retries when no probe result is available', () => {
    expect(decideCloseAction(1006)).toBe('retry');
    expect(decideCloseAction(1000)).toBe('retry');
    expect(decideCloseAction(1006, undefined)).toBe('retry');
  });

  it('retries every other transport-level close code', () => {
    for (const code of [1002, 1005, 1011, 1012, 1013, 1015, 0]) {
      expect(decideCloseAction(code, 'reachable')).toBe('retry');
      expect(decideCloseAction(code, 'unreachable')).toBe('retry');
    }
  });

  // The asymmetry is the design: an unnecessary retry costs one request, an
  // unnecessary stop costs every message until the user notices by hand.
  it('only ever stops on an authoritative signal', () => {
    const transportCodes = [1006, 1000, 1001, 1011, 1015];
    const nonPolicyProbes: (StreamerProbeResult | undefined)[] = [
      'reachable',
      'unreachable',
      undefined,
    ];
    for (const code of transportCodes) {
      for (const probe of nonPolicyProbes) {
        expect(decideCloseAction(code, probe)).toBe('retry');
      }
    }
  });
});
