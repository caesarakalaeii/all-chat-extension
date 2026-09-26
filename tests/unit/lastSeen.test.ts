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
  LAST_SEEN_KEY_PREFIX,
  advancesWatermark,
  buildViewerSocketUrl,
  coerceWatermark,
  extractMessageTimestamp,
  lastSeenKey,
  nextWatermark,
} from '../../src/lib/lastSeen';

describe('lastSeenKey', () => {
  it('mirrors the overlay ws_last_seen_{id} convention, one entry per streamer', () => {
    expect(LAST_SEEN_KEY_PREFIX).toBe('ws_last_seen');
    expect(lastSeenKey('somestreamer')).toBe('ws_last_seen_somestreamer');
  });

  it('normalises case so one streamer never gets two watermarks', () => {
    expect(lastSeenKey('SomeStreamer')).toBe(lastSeenKey('somestreamer'));
  });
});

describe('coerceWatermark', () => {
  it('accepts a positive finite timestamp', () => {
    expect(coerceWatermark(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('treats anything unusable as "no watermark"', () => {
    for (const bad of [undefined, null, 0, -1, NaN, Infinity, '123', {}, []]) {
      expect(coerceWatermark(bad)).toBe(0);
    }
  });
});

describe('buildViewerSocketUrl', () => {
  // The gateway requires ?since= > 0 to replay anything to a viewer, so a
  // reconnect that has a watermark must send one or it recovers nothing.
  it('sends ?since= when there is a watermark to send', () => {
    expect(buildViewerSocketUrl('wss://api.example', 'streamer', 1234)).toBe(
      'wss://api.example/ws/chat/streamer?since=1234'
    );
  });

  // Deliberate: a first-ever connect inherits the gateway's "no history flood
  // for a first-time viewer" policy rather than working around it.
  it('omits ?since= entirely on a first-ever connect', () => {
    expect(buildViewerSocketUrl('wss://api.example', 'streamer', 0)).toBe(
      'wss://api.example/ws/chat/streamer'
    );
  });
});

describe('nextWatermark', () => {
  it('advances to a newer timestamp', () => {
    expect(nextWatermark(1000, 2000)).toBe(2000);
  });

  // A replay burst arrives in order but a live frame can interleave with it.
  // Moving backwards would re-request messages already displayed.
  it('never moves backwards', () => {
    expect(nextWatermark(2000, 1000)).toBe(2000);
    expect(nextWatermark(2000, 2000)).toBe(2000);
  });

  it('ignores an unusable timestamp', () => {
    expect(nextWatermark(1000, NaN)).toBe(1000);
    expect(nextWatermark(1000, Infinity)).toBe(1000);
  });

  it('accepts the first timestamp from a zero watermark', () => {
    expect(nextWatermark(0, 1500)).toBe(1500);
  });
});

describe('extractMessageTimestamp', () => {
  it('parses the RFC3339 timestamp the gateway sends', () => {
    const frame = { type: 'chat_message', data: { timestamp: '2026-05-15T12:00:00Z' } };
    expect(extractMessageTimestamp(frame)).toBe(Date.parse('2026-05-15T12:00:00Z'));
  });

  // The envelope is stamped when the gateway forwards the frame, which during a
  // replay burst is *now*. Preferring it would jump the watermark past messages
  // still to come in the same burst and silently discard them.
  it('prefers the message timestamp over the envelope timestamp', () => {
    const frame = {
      type: 'chat_message',
      timestamp: '2026-05-15T12:00:00Z', // forwarded now
      data: { timestamp: '2026-05-15T11:55:00Z' }, // actually sent 5 min ago
    };
    expect(extractMessageTimestamp(frame)).toBe(Date.parse('2026-05-15T11:55:00Z'));
  });

  it('falls back to the envelope timestamp when the message has none', () => {
    const frame = { type: 'chat_message', timestamp: '2026-05-15T12:00:00Z', data: {} };
    expect(extractMessageTimestamp(frame)).toBe(Date.parse('2026-05-15T12:00:00Z'));
  });

  it('accepts a numeric ms-epoch timestamp', () => {
    expect(extractMessageTimestamp({ data: { timestamp: 1_700_000_000_000 } })).toBe(
      1_700_000_000_000
    );
  });

  it('returns 0 rather than NaN for anything unparseable', () => {
    for (const frame of [null, undefined, {}, { data: null }, { timestamp: 'not a date' }, 'x']) {
      expect(extractMessageTimestamp(frame)).toBe(0);
    }
  });
});

describe('advancesWatermark', () => {
  it('advances on frames that carry a real message timestamp', () => {
    expect(advancesWatermark('chat_message')).toBe(true);
    expect(advancesWatermark('message_update')).toBe(true);
  });

  // These are stamped at send time. Treating them as a watermark would skip the
  // buffered messages the very next reconnect is meant to recover.
  it('ignores frames whose timestamp is wall-clock at send time', () => {
    for (const type of ['connected', 'ping', 'pong', 'platform_status', 'error', '']) {
      expect(advancesWatermark(type)).toBe(false);
    }
  });
});
