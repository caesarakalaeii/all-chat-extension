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
 * EngagementPanel renders the streamer's live All-Chat poll / prediction inside the
 * chat overlay (PR #524 / backend ADR-0031). Presentational only — all state and actions come
 * from useEngagement. Mirrors the no-install participate page and the OBS widgets:
 * live bars with tallies, one-click vote, a wager input, and read-only rendering of a
 * mirrored Twitch-native round. Renders nothing when no round is live.
 */

import React, { useEffect, useState } from 'react';
import type { Poll, Prediction, ViewerEngagement } from '../../lib/types/engagement';

interface EngagementPanelProps {
  poll: Poll | null;
  prediction: Prediction | null;
  engagement: ViewerEngagement | null;
  pointsName: string;
  busy: boolean;
  notice: string | null;
  authed: boolean;
  /** REQUEST_LOGIN needs the content-script relay, absent in the pop-out window. */
  canLogin: boolean;
  /** True while an OAuth login is in flight — disables the sign-in button (no double-launch). */
  loginPending?: boolean;
  onVote: (optionIdx: number) => void;
  onWager: (outcomeIdx: number, amount: number) => void;
  onRequestLogin: () => void;
  onDismissNotice: () => void;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export default function EngagementPanel({
  poll,
  prediction,
  engagement,
  pointsName,
  busy,
  notice,
  authed,
  canLogin,
  loginPending = false,
  onVote,
  onWager,
  onRequestLogin,
  onDismissNotice,
}: EngagementPanelProps) {
  const [wagerAmount, setWagerAmount] = useState('');

  // Clear the input only once the wager is actually locked in (wager_outcome_id becomes
  // set) — never on a rejection, so a viewer whose wager bounced (insufficient / already /
  // closed) can adjust and retry without retyping the amount.
  const wagerLocked = Boolean(engagement?.wager_outcome_id);
  useEffect(() => {
    if (wagerLocked) setWagerAmount('');
  }, [wagerLocked]);

  // Also clear when the round itself rolls over (new prediction id), so a half-typed amount
  // left over from a previous prediction can't be submitted against the next one (item 2).
  // Keyed on the id (not the object) so a tally refresh of the *same* round doesn't wipe an
  // amount the viewer is mid-way through typing.
  useEffect(() => {
    setWagerAmount('');
  }, [prediction?.id]);

  const showPoll = poll && (poll.state === 'ACTIVE' || poll.state === 'CLOSED');
  // CANCELED is included so the ~20s cancel grace window (served by the backend's display
  // query) renders a "refunded" reveal instead of the panel silently vanishing (item 6).
  const showPrediction =
    prediction &&
    (prediction.state === 'ACTIVE' ||
      prediction.state === 'LOCKED' ||
      prediction.state === 'RESOLVED' ||
      prediction.state === 'CANCELED');

  if (!showPoll && !showPrediction) return null;

  const balance = engagement?.balance ?? 0;

  return (
    <div className="border-b border-border bg-surface px-3 py-2 space-y-3 text-sm">
      {/* Header: title + balance */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dim)]">
          Live now
        </span>
        {authed && engagement && (
          <span
            className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-text"
            title={`Your ${pointsName}`}
          >
            🔥 {balance.toLocaleString()} {pointsName}
          </span>
        )}
      </div>

      {notice && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 rounded bg-red-500/15 px-2 py-1.5 text-xs text-red-300"
        >
          <span>{notice}</span>
          <button
            onClick={onDismissNotice}
            aria-label="Dismiss"
            className="shrink-0 text-red-300 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      {showPoll && <PollBlock poll={poll!} engagement={engagement} authed={authed} busy={busy} onVote={onVote} />}

      {showPrediction && (
        <PredictionBlock
          prediction={prediction!}
          engagement={engagement}
          pointsName={pointsName}
          balance={balance}
          authed={authed}
          busy={busy}
          wagerAmount={wagerAmount}
          setWagerAmount={setWagerAmount}
          onWager={onWager}
        />
      )}

      {!authed && canLogin && (
        <button
          onClick={onRequestLogin}
          disabled={loginPending}
          className="w-full rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-purple-600"
        >
          {loginPending ? 'Opening sign-in…' : 'Sign in to take part'}
        </button>
      )}
      {!authed && !canLogin && (
        <p className="text-xs text-[var(--color-text-dim)]">Sign in from the chat window to take part.</p>
      )}
    </div>
  );
}

function PollBlock({
  poll,
  engagement,
  authed,
  busy,
  onVote,
}: {
  poll: Poll;
  engagement: ViewerEngagement | null;
  authed: boolean;
  busy: boolean;
  onVote: (optionIdx: number) => void;
}) {
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  const isNative = poll.source === 'twitch_native';
  const isClosed = poll.state === 'CLOSED';
  // Once a viewer has voted on an allow_change:false poll, the backend no-ops a second
  // vote (ON CONFLICT DO NOTHING) yet still returns 200 — so an unguarded re-click would
  // optimistically move the ✓ and then snap back on the /me refetch. Lock the options and
  // show a hint, mirroring the prediction block (item 3).
  const alreadyVoted = Boolean(engagement?.voted_option_id);
  const voteLocked = alreadyVoted && poll.allow_change === false;
  const canVote = authed && !isNative && !isClosed && !voteLocked;
  const maxVotes = poll.options.reduce((m, o) => Math.max(m, o.votes), 0);

  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 font-semibold text-text">
        <span aria-hidden>📊</span>
        <span className="min-w-0 flex-1 truncate">{poll.question}</span>
        {isClosed && (
          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--color-text-sub)]">
            Final
          </span>
        )}
      </h3>
      {isNative && (
        <p className="text-xs text-[var(--color-text-dim)]">Runs on Twitch — vote in Twitch chat.</p>
      )}
      {poll.options.map((o) => {
        const p = pct(o.votes, total);
        const mine = engagement?.voted_option_id === o.id;
        const isWinner = isClosed && maxVotes > 0 && o.votes === maxVotes;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => canVote && onVote(o.idx)}
            disabled={!canVote || busy}
            aria-pressed={mine}
            className={`relative flex w-full items-center justify-between overflow-hidden rounded border px-2 py-1.5 text-left ${
              mine ? 'border-purple-500' : 'border-border'
            } ${canVote && !busy ? 'hover:border-purple-400 cursor-pointer' : 'cursor-default'} ${
              !canVote && !isClosed ? 'opacity-80' : ''
            }`}
          >
            <span className="absolute inset-y-0 left-0 bg-purple-500/20" style={{ width: `${p}%` }} />
            <span className="relative min-w-0 flex-1 truncate font-medium text-text">
              {o.idx}. {o.label}
              {mine && <span className="ml-1" aria-hidden>✓</span>}
              {isWinner && (
                <span className="ml-1 rounded bg-yellow-400 px-1 py-0.5 text-[9px] font-bold uppercase text-black">
                  Winner
                </span>
              )}
            </span>
            <span className="relative ml-2 shrink-0 tabular-nums text-xs text-[var(--color-text-sub)]">
              {p}% ({o.votes.toLocaleString()})
            </span>
          </button>
        );
      })}
      {authed && voteLocked && !isClosed && (
        <p className="text-xs text-[var(--color-text-dim)]">You&apos;ve locked in your vote for this round.</p>
      )}
    </section>
  );
}

function PredictionBlock({
  prediction,
  engagement,
  pointsName,
  balance,
  authed,
  busy,
  wagerAmount,
  setWagerAmount,
  onWager,
}: {
  prediction: Prediction;
  engagement: ViewerEngagement | null;
  pointsName: string;
  balance: number;
  authed: boolean;
  busy: boolean;
  wagerAmount: string;
  setWagerAmount: (v: string) => void;
  onWager: (outcomeIdx: number, amount: number) => void;
}) {
  const total = prediction.outcomes.reduce((s, o) => s + o.total_points, 0);
  const isNative = prediction.source === 'twitch_native';
  const isOpen = prediction.state === 'ACTIVE';
  const isLocked = prediction.state === 'LOCKED';
  const isResolved = prediction.state === 'RESOLVED';
  const isCanceled = prediction.state === 'CANCELED';
  const alreadyWagered = Boolean(engagement?.wager_outcome_id);
  // Require a loaded viewer snapshot too: without `engagement`, `balance` falls back to 0 and
  // a wager would be rejected client-side with "you have 0" even for a viewer who *has* points
  // but whose /me is momentarily unavailable. Hide the input until the snapshot loads (item 7).
  const canWager = authed && !isNative && isOpen && !alreadyWagered && Boolean(engagement);

  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 font-semibold text-text">
        <span aria-hidden>🔮</span>
        <span className="min-w-0 flex-1 truncate">{prediction.title}</span>
        {isLocked && (
          <span className="shrink-0 text-[10px] font-bold uppercase text-[var(--color-text-sub)]" aria-hidden>
            🔒 Locked
          </span>
        )}
        {isResolved && (
          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--color-text-sub)]">
            Resolved
          </span>
        )}
        {isCanceled && (
          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--color-text-sub)]">
            Canceled
          </span>
        )}
      </h3>
      {isNative && (
        <p className="text-xs text-[var(--color-text-dim)]">Runs on Twitch channel points.</p>
      )}
      {isCanceled && (
        <p className="text-xs text-[var(--color-text-dim)]">
          Prediction canceled{alreadyWagered ? ' — your wager was refunded' : ''}.
        </p>
      )}

      {canWager && (
        <div className="flex items-center gap-2">
          <label htmlFor="allchat-wager" className="sr-only">
            Amount to wager in {pointsName}
          </label>
          <input
            id="allchat-wager"
            type="number"
            min={1}
            max={balance}
            inputMode="numeric"
            value={wagerAmount}
            onChange={(e) => setWagerAmount(e.target.value)}
            placeholder={`Wager (${pointsName})`}
            className="w-full rounded border border-border bg-bg px-2 py-1 text-xs text-text placeholder-[var(--color-text-dim)] focus:outline-hidden focus:border-[var(--color-text-dim)]"
          />
          <button
            type="button"
            onClick={() => setWagerAmount(String(balance))}
            className="shrink-0 rounded px-1.5 py-1 text-xs font-medium text-[var(--color-text-sub)] underline hover:text-text"
          >
            Max
          </button>
        </div>
      )}

      {prediction.outcomes.map((o) => {
        const p = pct(o.total_points, total);
        const mine = engagement?.wager_outcome_id === o.id;
        const isWinner = isResolved && prediction.winning_outcome_id === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              if (!canWager) return;
              const amt = Number.parseInt(wagerAmount, 10);
              onWager(o.idx, amt);
            }}
            disabled={!canWager || busy}
            aria-pressed={mine}
            className={`relative flex w-full items-center justify-between overflow-hidden rounded border px-2 py-1.5 text-left ${
              mine ? 'border-sky-500' : 'border-border'
            } ${canWager && !busy ? 'hover:border-sky-400 cursor-pointer' : 'cursor-default'} ${
              isWinner ? 'border-yellow-400' : ''
            }`}
          >
            <span className="absolute inset-y-0 left-0 bg-sky-500/20" style={{ width: `${p}%` }} />
            <span className="relative min-w-0 flex-1 truncate font-medium text-text">
              {o.idx}. {o.label}
              {mine && (
                <span className="ml-1 text-[var(--color-text-sub)]">
                  · your wager {(engagement?.wager_amount ?? 0).toLocaleString()}
                </span>
              )}
              {isWinner && (
                <span className="ml-1 rounded bg-yellow-400 px-1 py-0.5 text-[9px] font-bold uppercase text-black">
                  Winner
                </span>
              )}
            </span>
            <span className="relative ml-2 shrink-0 tabular-nums text-xs text-[var(--color-text-sub)]">
              {o.total_points.toLocaleString()} · {p}%
            </span>
          </button>
        );
      })}
      {authed && alreadyWagered && isOpen && (
        <p className="text-xs text-[var(--color-text-dim)]">You&apos;ve locked in your wager for this round.</p>
      )}
    </section>
  );
}
