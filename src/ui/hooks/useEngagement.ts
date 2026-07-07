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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Poll, Prediction, ViewerEngagement } from '../../lib/types/engagement';
import * as engagementApi from '../../lib/engagementClient';

/**
 * useEngagement drives the extension's poll/prediction panel (PR #524 / backend ADR-0031;
 * extension-side architecture: docs/adr/007-streamer-keyed-engagement-sw-proxy.md).
 *
 * The authoritative state is pulled from the streamer-keyed HTTP endpoints (which
 * apply the All-Chat-over-native display precedence). The overlay chat WebSocket
 * delivers `poll_update` / `prediction_update` frames — we treat those purely as a
 * "something changed, refetch now" signal (via `onWsFrame`), matching the frontend's
 * `useEngagementLive`. A live round also gets a slow fallback poll so a missed frame
 * and points earned off-band (subs/bits) still reconcile; when nothing is live there
 * is no polling — the next round's creation frame wakes us.
 */

const REFRESH_DEBOUNCE_MS = 400;
const ACTIVE_POLL_MS = 15_000;
const HEARTBEAT_MS = 60_000;

// wagerRejectionCopy maps the server's machine reason for a rejected wager to human
// copy, so a failure is actionable rather than the opaque "wager not accepted".
// Reasons come from the engagement-service repository WagerResult.Reason.
// Exported for unit testing (the reason→copy table).
export function wagerRejectionCopy(reason: string | undefined, pointsName: string, balance: number): string {
  switch (reason) {
    case 'not_found':
      return 'This prediction is no longer available.';
    case 'not_active':
      return 'Betting is closed for this round.';
    case 'bad_outcome':
      return 'That outcome is not valid.';
    case 'already_wagered':
      return 'You already placed a wager this round.';
    case 'insufficient':
      return `Not enough ${pointsName}. You have ${balance.toLocaleString()}.`;
    case 'native':
      return 'This prediction runs on Twitch channel points.';
    default:
      return 'Wager not accepted.';
  }
}

export interface EngagementState {
  poll: Poll | null;
  prediction: Prediction | null;
  engagement: ViewerEngagement | null;
  pointsName: string;
  busy: boolean;
  notice: string | null;
  vote: (optionIdx: number) => void;
  wager: (outcomeIdx: number, amount: number) => void;
  clearNotice: () => void;
  /** Called by ChatContainer when a poll_update/prediction_update WS frame arrives. */
  onWsFrame: () => void;
}

export function useEngagement(streamer: string, authed: boolean): EngagementState {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [engagement, setEngagement] = useState<ViewerEngagement | null>(null);
  const [pointsName, setPointsName] = useState('Points');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authedRef = useRef(authed);
  authedRef.current = authed;
  // Monotonic request-sequence guard. refresh() runs from four uncoordinated sources
  // (init, the live-round interval, the WS-frame debounce, and post-vote/wager), and a
  // vote/wager races its own reconciling refresh. Each refresh captures the seq before its
  // await and bails on resolution if a newer refresh or action has bumped it; each action
  // bumps it up-front so a stale in-flight refresh can never revert a fresh vote (item 1).
  const seqRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!streamer) return;
    const mySeq = ++seqRef.current;
    const [active, me] = await Promise.all([
      engagementApi.fetchActive(streamer),
      authedRef.current ? engagementApi.fetchMe(streamer) : Promise.resolve<ViewerEngagement | null>(null),
    ]);
    // Bail if unmounted, or if a newer refresh / a vote·wager has superseded this one —
    // a stale response must never overwrite fresher state (item 1).
    if (!aliveRef.current || seqRef.current !== mySeq) return;
    // fetchActive returns undefined on a transient failure (SW asleep / 5xx) — keep the
    // last round rendered; null or an object is a definitive answer (incl. a 404 when the
    // overlay went private, or a 200 with no live round) — clear/replace accordingly.
    if (active !== undefined) {
      setPoll(active?.poll ?? null);
      setPrediction(active?.prediction ?? null);
      if (active?.points_name) setPointsName(active.points_name);
    }
    if (me) {
      setEngagement(me);
      if (me.points_name) setPointsName(me.points_name);
    } else if (!authedRef.current) {
      setEngagement(null);
    }
  }, [streamer]);

  // Initial load + reset when the watched stream changes. `refresh`'s identity changes
  // only when `streamer` does, so this clears the stale round and refetches on a switch.
  useEffect(() => {
    setPoll(null);
    setPrediction(null);
    setEngagement(null);
    void refresh();
  }, [refresh]);

  // On an auth change (login / logout / expiry) refresh the viewer snapshot *in place*.
  // The poll/prediction are the PUBLIC aggregate and don't depend on auth, so we must not
  // blank them on a toggle (which flickered the still-live round, item 4). Keyed on `authed`
  // alone (refresh is read through a ref so a streamer switch doesn't double-fetch here);
  // the mount run is skipped since the effect above already did the initial fetch.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const didAuthMountRef = useRef(false);
  useEffect(() => {
    if (!didAuthMountRef.current) {
      didAuthMountRef.current = true;
      return;
    }
    void refreshRef.current();
  }, [authed]);

  // Fallback reconcile while a round is live (self-heals a dropped frame; refreshes the
  // balance earned off-band). Keyed on presence, not the round objects, so a tally change
  // doesn't churn the timer — it arms when a round appears and tears down when it's gone.
  const roundActive = Boolean(poll || prediction);
  useEffect(() => {
    if (!roundActive) return;
    const t = setInterval(() => void refresh(), ACTIVE_POLL_MS);
    return () => clearInterval(t);
  }, [refresh, roundActive]);

  // Watch-time heartbeat while logged in — awards the streamer's configured points and
  // keeps the shown balance current.
  useEffect(() => {
    if (!authed || !streamer) return;
    const t = setInterval(() => {
      void engagementApi.heartbeat(streamer).then((balance) => {
        if (balance != null && aliveRef.current) {
          setEngagement((prev) => (prev ? { ...prev, balance } : prev));
        }
      });
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [authed, streamer]);

  const onWsFrame = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const vote = useCallback(
    (optionIdx: number) => {
      if (!poll || busy || poll.source === 'twitch_native') return;
      setBusy(true);
      setNotice(null);
      // Advance the request-sequence high-water so any refresh already in flight (e.g. a
      // pre-vote interval fetch) bails on resolution instead of reverting this vote (item 1).
      seqRef.current++;
      // Optimistic: highlight the chosen option immediately (the id is resolved from idx).
      // Capture the prior vote inside the updater (engagement isn't a dep) so a failure can
      // roll the highlight back even if the reconciling refetch also fails.
      const chosen = poll.options.find((o) => o.idx === optionIdx);
      let prevVotedId: string | undefined;
      if (chosen) {
        setEngagement((prev) => {
          if (!prev) return prev;
          prevVotedId = prev.voted_option_id;
          return { ...prev, voted_option_id: chosen.id };
        });
      }
      void engagementApi.vote(streamer, poll.id, optionIdx).then((res) => {
        if (!aliveRef.current) return;
        setBusy(false);
        if (res.error) {
          setNotice('Vote failed. Try again.');
          setEngagement((prev) => (prev ? { ...prev, voted_option_id: prevVotedId } : prev));
          void refresh();
          return;
        }
        // Only a real poll carries an id; the backend returns a bodyless 200 {status:"ok"}
        // when it accepted the vote but its GetPoll follow-up failed — ignore that sentinel
        // so it doesn't blank the live poll until the trailing refresh reconciles (item 5).
        if (res.poll?.id) setPoll(res.poll);
        void refresh();
      });
    },
    [poll, busy, streamer, refresh]
  );

  const wager = useCallback(
    (outcomeIdx: number, amount: number) => {
      if (!prediction || busy || prediction.source === 'twitch_native') return;
      if (!Number.isFinite(amount) || amount <= 0) {
        setNotice('Enter a positive amount to wager.');
        return;
      }
      const balance = engagement?.balance ?? 0;
      if (amount > balance) {
        setNotice(`Not enough ${pointsName}. You have ${balance.toLocaleString()}.`);
        return;
      }
      setBusy(true);
      setNotice(null);
      // Supersede any in-flight refresh so it can't overwrite this wager's result (item 1).
      seqRef.current++;
      void engagementApi.wager(streamer, prediction.id, outcomeIdx, amount).then((res) => {
        if (!aliveRef.current) return;
        setBusy(false);
        if (res.error) {
          setNotice(wagerRejectionCopy(res.reason, pointsName, balance));
          void refresh();
          return;
        }
        if (res.prediction) setPrediction(res.prediction);
        if (res.balance != null) {
          setEngagement((prev) => (prev ? { ...prev, balance: res.balance! } : prev));
        }
        void refresh();
      });
    },
    [prediction, busy, streamer, engagement, pointsName, refresh]
  );

  return { poll, prediction, engagement, pointsName, busy, notice, vote, wager, clearNotice, onWsFrame };
}
