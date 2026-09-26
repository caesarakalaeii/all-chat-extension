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
 * Decide whether a closed viewer WebSocket should be retried or given up on.
 *
 * Why this is not obvious from the close code alone: the api-gateway rejects a
 * streamer with no public overlay *before* the WebSocket upgrade, with an HTTP
 * 404. A close frame needs a connection that was upgraded, so on a rejected
 * handshake the browser's WebSocket API reports code 1006 with an empty reason
 * — always, and the 404 is never visible to JS. 1006 is therefore also what we
 * see for DNS failure, a TLS problem, a cold-start proxy, and a gateway rolling
 * mid-connect.
 *
 * The old heuristic guessed: `code === 1006 && attempts === 0` meant "not
 * public". Every one of those transient failures matched it on a first attempt,
 * and matching meant the socket was never retried — the extension went silent
 * until a manual reset.
 *
 * So we ask instead. `fetchStreamerInfo()` already resolves the streamer over
 * HTTP before connecting, and its response now carries `viewer_public`, which
 * answers exactly the question 1006 cannot. This module holds the resulting
 * decision as a pure function so it can be tested without a socket, mirroring
 * `backoff.ts`.
 */

/**
 * What the HTTP re-probe of `/api/v1/auth/streamers/{username}` established.
 *
 * The three cases are deliberately distinct: only `not-public` is a policy
 * answer. `unreachable` covers a 5xx, a network error, a timeout, and an
 * unparseable body — all of which are transport failures that say nothing about
 * whether the overlay is public, and none of which may stop the retry loop.
 * A gateway that predates the `viewer_public` field reports `reachable`,
 * because an absent flag is not an explicit denial.
 */
export type StreamerProbeResult =
  /** 200, and `viewer_public` was true (or absent, on an older gateway). */
  | 'reachable'
  /** 200 with an explicit `viewer_public: false`, or a 404. The only stop signal. */
  | 'not-public'
  /** Anything else: 5xx, network error, timeout, unparseable body. */
  | 'unreachable';

export type CloseAction = 'stop' | 'retry';

/**
 * WebSocket close codes in 4000–4999 are reserved for the application. The
 * gateway uses them to say something deliberate about *this* connection, so
 * they are the one class of close we take at face value.
 */
export function isApplicationCloseCode(code: number): boolean {
  return code >= 4000 && code <= 4999;
}

/**
 * Should the socket be reconnected?
 *
 * @param closeCode  `CloseEvent.code` from the socket that just died.
 * @param probeResult Outcome of re-probing the streamer over HTTP, or
 *   `undefined` when no probe was performed (e.g. it has not resolved yet).
 *   Undefined is treated as "no policy answer", which means retry.
 *
 * The rule is short on purpose: stop only when something authoritative said to.
 * Everything else retries, because the reconnect loop is bounded by exponential
 * backoff and an unnecessary retry costs one request, while an unnecessary stop
 * costs every message until the user notices and resets the extension by hand.
 */
export function decideCloseAction(
  closeCode: number,
  probeResult?: StreamerProbeResult
): CloseAction {
  // An application close code is the gateway speaking about this connection
  // directly. Believe it; do not second-guess it with an HTTP probe.
  if (isApplicationCloseCode(closeCode)) return 'stop';

  // A clean close (1000 normal, 1001 going away) is either our own
  // disconnect or the server shutting the connection down politely. 1001 in
  // particular is what a pod says on its way out during a rolling deploy, so
  // the reconnect that follows is precisely what we want.
  //
  // Falls through to the probe check below like every other non-application
  // code: a deliberate local disconnect tears down the handler rather than
  // relying on the close code to mean "stay down".

  // Only an explicit policy answer stops the loop. 'unreachable' and
  // undefined are transport-level and must not.
  if (probeResult === 'not-public') return 'stop';

  return 'retry';
}
