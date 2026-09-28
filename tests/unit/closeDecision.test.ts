/**
 * This file is part of All-Chat Extension.
 * Copyright (C) 2026 caesarakalaeii
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
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
import { isConfirmedNotPublic } from '../../src/lib/closeDecision';

const firstAttempt = { code: 1006, attempts: 0 };

describe('isConfirmedNotPublic', () => {
  it('classifies an explicit false for the same streamer as not-public', () => {
    expect(
      isConfirmedNotPublic({
        ...firstAttempt,
        viewerPublic: false,
        viewerPublicStreamer: 'caesar',
        streamer: 'caesar',
      }),
    ).toBe(true);
  });

  it('keeps a first-attempt 1006 with no recorded flag in the retry loop', () => {
    // Service-worker restart / keepalive reconnects fetch nothing: the close
    // must not be mislabeled as a permanent streamer-side setting.
    expect(
      isConfirmedNotPublic({ ...firstAttempt, viewerPublic: null, viewerPublicStreamer: null, streamer: 'caesar' }),
    ).toBe(false);
  });

  it('keeps a first-attempt 1006 with viewer_public true in the retry loop', () => {
    expect(
      isConfirmedNotPublic({
        ...firstAttempt,
        viewerPublic: true,
        viewerPublicStreamer: 'caesar',
        streamer: 'caesar',
      }),
    ).toBe(false);
  });

  it('ignores a flag fetched for a different streamer', () => {
    // Tab A is connected to public streamer A; tab B fetches private streamer
    // B. The flag on record belongs to B and must not label A's 1006.
    expect(
      isConfirmedNotPublic({
        ...firstAttempt,
        viewerPublic: false,
        viewerPublicStreamer: 'private-streamer',
        streamer: 'public-streamer',
      }),
    ).toBe(false);
  });

  it('keeps every later attempt in the retry loop regardless of the flag', () => {
    expect(
      isConfirmedNotPublic({
        code: 1006,
        attempts: 1,
        viewerPublic: false,
        viewerPublicStreamer: 'caesar',
        streamer: 'caesar',
      }),
    ).toBe(false);
  });

  it('ignores non-1006 close codes', () => {
    expect(
      isConfirmedNotPublic({
        code: 1000,
        attempts: 0,
        viewerPublic: false,
        viewerPublicStreamer: 'caesar',
        streamer: 'caesar',
      }),
    ).toBe(false);
  });

  it('rejects a flag owner of null even when the flag is false', () => {
    // The viewerPublicStreamer !== null clause: a false flag with no owner
    // must never classify — it cannot be tied to the connected streamer.
    expect(
      isConfirmedNotPublic({ ...firstAttempt, viewerPublic: false, viewerPublicStreamer: null, streamer: 'caesar' }),
    ).toBe(false);
  });
});
