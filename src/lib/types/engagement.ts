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
 * Engagement types (polls, predictions, points — all-chat issue #523 / PR #524).
 * These mirror the JSON the engagement-service returns; see the backend
 * services/engagement-service/models. The extension participates by streamer
 * username (backend ADR-0031) — it never learns the overlay id — so it talks to the
 * streamer-keyed endpoints and receives live snapshots over the existing chat
 * WebSocket as `poll_update` / `prediction_update` frames.
 */

export type EngagementSource = 'allchat' | 'twitch_native';
export type PollState = 'ACTIVE' | 'CLOSED';
export type PredictionState = 'CREATED' | 'ACTIVE' | 'LOCKED' | 'RESOLVED' | 'CANCELED';

export interface PollOption {
  id: string;
  idx: number; // 1-based
  label: string;
  votes: number;
}

export interface Poll {
  id: string;
  // overlay_id is intentionally never serialized by the backend (json:"-") — the
  // extension deals only in streamer usernames (backend ADR-0031).
  source: EngagementSource;
  external_id?: string;
  question: string;
  state: PollState;
  allow_change: boolean;
  options: PollOption[];
  created_at: string;
  ends_at?: string;
  closed_at?: string;
}

export interface PredictionOutcome {
  id: string;
  idx: number; // 1-based
  label: string;
  color?: string;
  total_points: number;
  entrants: number;
}

export interface Prediction {
  id: string;
  source: EngagementSource;
  external_id?: string;
  title: string;
  state: PredictionState;
  winning_outcome_id?: string;
  outcomes: PredictionOutcome[];
  auto_lock_at?: string;
  created_at: string;
  locked_at?: string;
  resolved_at?: string;
}

/** Private per-viewer snapshot from GET /engagement/streamers/{username}/me. */
export interface ViewerEngagement {
  points_name: string;
  balance: number;
  voted_option_id?: string;
  wager_outcome_id?: string;
  wager_amount?: number;
}

/** Public aggregate from GET /engagement/streamers/{username}/active. */
export interface StreamerActive {
  points_name: string;
  poll: Poll | null;
  prediction: Prediction | null;
}

/**
 * WebSocket frame payloads. The gateway fans engagement snapshots onto the same
 * overlay socket the extension already uses for chat; the `data` field wraps the
 * round under `poll` / `prediction` (NOT flattened) plus an aggregate total.
 */
export interface PollSnapshot {
  poll: Poll;
  total_votes: number;
}

export interface PredictionSnapshot {
  prediction: Prediction;
  total_points: number;
}
