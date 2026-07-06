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
 * Engagement client (PR #524 / ADR-0031). Thin wrappers over the service worker,
 * which is the API proxy — it holds the viewer JWT and calls the streamer-keyed
 * endpoints. Works from both the in-page iframe and the pop-out window: both are
 * extension pages with `chrome.runtime` access.
 */

import type { ExtensionMessage, ExtensionResponse } from './types/extension';
import type { Poll, Prediction, StreamerActive, ViewerEngagement } from './types/engagement';

async function send(message: ExtensionMessage): Promise<ExtensionResponse> {
  try {
    const res = (await chrome.runtime.sendMessage(message)) as ExtensionResponse | undefined;
    return res ?? { success: false, error: 'NO_RESPONSE' };
  } catch (err) {
    // The MV3 service worker can be momentarily asleep/restarting; treat that as a
    // transient failure the caller retries on its next tick.
    return { success: false, error: err instanceof Error ? err.message : 'SEND_FAILED' };
  }
}

/**
 * Public aggregate (poll/prediction/points-name). Returns the object when a round is
 * live, `null` when there is definitively no live/public round (200 with no round, or a
 * 404 because the overlay went private), and `undefined` on a transient failure (service
 * worker asleep / 5xx) so callers can keep the last render instead of wrongly clearing it.
 */
export async function fetchActive(streamer: string): Promise<StreamerActive | null | undefined> {
  const res = await send({ type: 'ENGAGEMENT_ACTIVE', streamerUsername: streamer });
  if (!res.success) return undefined;
  return (res.data as StreamerActive | null) ?? null;
}

/** Per-viewer snapshot; null when logged out or unavailable. */
export async function fetchMe(streamer: string): Promise<ViewerEngagement | null> {
  const res = await send({ type: 'ENGAGEMENT_ME', streamerUsername: streamer });
  return res.success ? ((res.data as ViewerEngagement | null) ?? null) : null;
}

export interface VoteResult {
  poll?: Poll;
  error?: string;
}

/** Cast/change a poll vote (option is 1-based). */
export async function vote(streamer: string, pollId: string, optionIdx: number): Promise<VoteResult> {
  const res = await send({ type: 'ENGAGEMENT_VOTE', streamerUsername: streamer, pollId, optionIdx });
  if (res.success) return { poll: res.data as Poll };
  return { error: res.error };
}

export interface WagerResult {
  balance?: number;
  prediction?: Prediction;
  error?: string;
  /** Machine-readable rejection reason (insufficient, already_wagered, not_active, …). */
  reason?: string;
}

/** Place a points wager on a prediction outcome (outcome is 1-based). */
export async function wager(
  streamer: string,
  predictionId: string,
  outcomeIdx: number,
  amount: number,
): Promise<WagerResult> {
  const res = await send({ type: 'ENGAGEMENT_WAGER', streamerUsername: streamer, predictionId, outcomeIdx, amount });
  if (res.success) {
    const data = res.data as { balance?: number; prediction?: Prediction } | null;
    return { balance: data?.balance, prediction: data?.prediction };
  }
  const data = (res as { data?: { reason?: string } }).data;
  return { error: res.error, reason: data?.reason };
}

/** Watch-time heartbeat; returns the new balance or null. */
export async function heartbeat(streamer: string): Promise<number | null> {
  const res = await send({ type: 'ENGAGEMENT_HEARTBEAT', streamerUsername: streamer });
  if (!res.success) return null;
  const data = res.data as { balance?: number } | null;
  return data?.balance ?? null;
}
