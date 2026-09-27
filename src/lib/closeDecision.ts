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

/**
 * First-attempt 1006 close classification.
 *
 * A 1006 on the very first connection attempt is ambiguous in itself: it is
 * what a "not public for viewers" rejection looks like, but also what a
 * cold-start proxy failure or a gateway rolling mid-connect looks like. The
 * authoritative answer is the viewer_public flag from
 * GET /auth/streamers/:username, which the service worker records when the
 * content script fetches streamer info for the streamer it is about to connect
 * to (the fetch always precedes CONNECT_WEBSOCKET in the real flow).
 *
 * Only an explicit false — fetched for the SAME streamer the socket was
 * connected to — may show the OVERLAY_NOT_PUBLIC hint. Everything else
 * (flag never fetched, fetched for another streamer, true, or any later
 * attempt) stays in the reconnect loop so a transient blip is never
 * mislabeled as a permanent streamer-side setting.
 */

export interface CloseAttempt {
  /** The WebSocket close code. */
  code: number;
  /** Reconnect attempt counter at the time of the close (0 = first attempt). */
  attempts: number;
  /** viewer_public recorded for `streamer`, or null if none was recorded. */
  viewerPublic: boolean | null;
  /** The streamer the recorded viewer_public belongs to. */
  viewerPublicStreamer: string | null;
  /** The streamer the socket was connected to. */
  streamer: string | null;
}

export function isNotPublicError(attempt: CloseAttempt): boolean {
  return (
    attempt.code === 1006 &&
    attempt.attempts === 0 &&
    attempt.viewerPublic === false &&
    attempt.viewerPublicStreamer !== null &&
    attempt.viewerPublicStreamer === attempt.streamer
  );
}
