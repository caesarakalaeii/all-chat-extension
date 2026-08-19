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

/**
 * The `ws_last_seen` watermark: what the extension sends as `?since=` so a
 * reconnect recovers the messages it missed.
 *
 * The viewer WebSocket endpoint requires an explicit `?since=` to replay
 * anything at all — unlike the owner endpoint, a missing value means "send
 * nothing", not "send everything", so a first-time viewer is not dropped into
 * five minutes of chat they never saw. That policy is correct. The bug it
 * exposed was that the extension never sent one, making the client that
 * reconnects most often the only one that recovered nothing.
 *
 * Storage lives in the service worker (chrome.storage.local, keyed per
 * streamer). The decisions live here, as pure functions, so they can be tested
 * — the same split as `backoff.ts` and `closeReason.ts`.
 */

/**
 * chrome.storage.local key prefix, one entry per streamer. Mirrors the web
 * overlay's `ws_last_seen_{overlay_id}` localStorage convention
 * (all-chat: frontend/src/hooks/useOverlayStream.ts).
 *
 * Local, emphatically not session: the point is to survive the browser closing,
 * which is exactly when session storage is cleared.
 */
export const LAST_SEEN_KEY_PREFIX = 'ws_last_seen';

/** Storage key holding the newest message timestamp seen for one streamer. */
export function lastSeenKey(streamerUsername: string): string {
  return `${LAST_SEEN_KEY_PREFIX}_${streamerUsername.toLowerCase()}`;
}

/**
 * Normalise a value read back from storage into a usable watermark.
 *
 * Anything that is not a positive finite number becomes 0, which the caller
 * reads as "no watermark" and therefore sends no `?since=` at all.
 */
export function coerceWatermark(stored: unknown): number {
  return typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? stored : 0;
}

/**
 * Build the viewer WebSocket URL, appending `?since=` only when there is a
 * watermark to send.
 *
 * A watermark of 0 means we have never seen a message from this streamer, so no
 * `?since=` goes out and the gateway's deliberate "no history flood for a
 * first-time viewer" policy is inherited rather than worked around.
 */
export function buildViewerSocketUrl(
  wsBaseUrl: string,
  streamerUsername: string,
  lastSeenMs: number
): string {
  const base = `${wsBaseUrl}/ws/chat/${streamerUsername}`;
  return lastSeenMs > 0 ? `${base}?since=${lastSeenMs}` : base;
}

/**
 * The next watermark value given the current one and an incoming timestamp.
 *
 * Monotonic on purpose. A replay burst arrives in chronological order but a
 * live frame can interleave with it, and a watermark that moved backwards would
 * re-request messages already displayed. Returns `current` unchanged when there
 * is nothing to advance to, so callers can skip the storage write.
 */
export function nextWatermark(current: number, incomingMs: number): number {
  if (!Number.isFinite(incomingMs) || incomingMs <= current) return current;
  return incomingMs;
}

/**
 * Pull a ms-epoch timestamp out of an inbound WebSocket frame.
 *
 * Prefers the chat message's own timestamp over the envelope's. The envelope is
 * stamped when the gateway forwards the frame, which during a replay burst is
 * *now* — using it would jump the watermark past messages still to come in the
 * same burst and silently discard them on the next reconnect.
 */
export function extractMessageTimestamp(message: unknown): number {
  if (!message || typeof message !== 'object') return 0;

  const envelope = message as { timestamp?: unknown; data?: { timestamp?: unknown } | null };
  const raw = envelope.data?.timestamp ?? envelope.timestamp;

  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : 0;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Frame types that carry a message timestamp worth advancing the watermark on.
 *
 * Deliberately excludes `connected`, `ping`/`pong` and `platform_status`: their
 * timestamps are wall-clock at send time, so treating them as a watermark would
 * skip the buffered messages the very next reconnect is meant to recover.
 */
export function advancesWatermark(messageType: string): boolean {
  return messageType === 'chat_message' || messageType === 'message_update';
}
