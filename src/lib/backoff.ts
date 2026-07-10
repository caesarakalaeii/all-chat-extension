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
 * Exponential backoff with jitter for WebSocket reconnection.
 *
 * Ported verbatim from the web overlay's computeBackoffDelay
 * (all-chat: frontend/src/lib/utils/overlayStreamCore.ts) so the extension and
 * the overlay reconnect identically: min(1000 * 1.5^attempts, 30000) +
 * [0, 1000) ms of jitter.
 *
 * The 30s ceiling bounds server load during a long outage; the jitter
 * de-synchronizes a thundering herd of overlays/extensions all reconnecting at
 * once after a rolling redeploy. `rng` is injectable so tests can pin the
 * jitter. There is deliberately no attempt cap — callers retry indefinitely.
 */
export function computeBackoffDelay(attempts: number, rng: () => number = Math.random): number {
  const baseDelay = 1000;
  const maxDelay = 30000;
  const jitter = rng() * 1000;
  return Math.min(baseDelay * Math.pow(1.5, attempts), maxDelay) + jitter;
}
