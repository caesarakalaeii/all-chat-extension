import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEngagement, wagerRejectionCopy } from '../../src/ui/hooks/useEngagement';
import type { Poll, Prediction, StreamerActive, ViewerEngagement } from '../../src/lib/types/engagement';

// The hook talks only to engagementClient; mock it so we drive fetch resolution order.
vi.mock('../../src/lib/engagementClient', () => ({
  fetchActive: vi.fn(),
  fetchMe: vi.fn(),
  vote: vi.fn(),
  wager: vi.fn(),
  heartbeat: vi.fn(),
}));
import * as api from '../../src/lib/engagementClient';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const fetchActive = api.fetchActive as unknown as ReturnType<typeof vi.fn>;
const fetchMe = api.fetchMe as unknown as ReturnType<typeof vi.fn>;
const voteFn = api.vote as unknown as ReturnType<typeof vi.fn>;
const wagerFn = api.wager as unknown as ReturnType<typeof vi.fn>;
const heartbeat = api.heartbeat as unknown as ReturnType<typeof vi.fn>;

function makePoll(over: Partial<Poll> = {}): Poll {
  return {
    id: 'poll-1',
    source: 'allchat',
    question: 'Q?',
    state: 'ACTIVE',
    allow_change: true,
    options: [
      { id: 'opt-1', idx: 1, label: 'A', votes: 1 },
      { id: 'opt-2', idx: 2, label: 'B', votes: 2 },
    ],
    created_at: '2026-07-07T00:00:00Z',
    ...over,
  };
}
const round = (poll: Poll): StreamerActive => ({ points_name: 'Points', poll, prediction: null });

function makePrediction(over: Partial<Prediction> = {}): Prediction {
  return {
    id: 'pred-1',
    source: 'allchat',
    title: 'Win?',
    state: 'ACTIVE',
    outcomes: [
      { id: 'out-1', idx: 1, label: 'Yes', total_points: 100, entrants: 2 },
      { id: 'out-2', idx: 2, label: 'No', total_points: 50, entrants: 1 },
    ],
    created_at: '2026-07-07T00:00:00Z',
    ...over,
  };
}
const roundP = (prediction: Prediction): StreamerActive => ({ points_name: 'Points', poll: null, prediction });

beforeEach(() => {
  fetchActive.mockReset();
  fetchMe.mockReset();
  voteFn.mockReset();
  wagerFn.mockReset();
  heartbeat.mockReset();
  heartbeat.mockResolvedValue(null);
});

describe('wagerRejectionCopy table', () => {
  it('maps every known reason to actionable copy', () => {
    expect(wagerRejectionCopy('not_found', 'Points', 0)).toMatch(/no longer available/i);
    expect(wagerRejectionCopy('not_active', 'Points', 0)).toMatch(/closed/i);
    expect(wagerRejectionCopy('bad_outcome', 'Points', 0)).toMatch(/not valid/i);
    expect(wagerRejectionCopy('already_wagered', 'Points', 0)).toMatch(/already placed/i);
    expect(wagerRejectionCopy('native', 'Points', 0)).toMatch(/twitch channel points/i);
  });

  it('interpolates the points name and balance for insufficient funds', () => {
    const copy = wagerRejectionCopy('insufficient', 'Gold', 1234);
    expect(copy).toContain('Gold');
    expect(copy).toContain('1,234');
  });

  it('falls back for an unknown reason', () => {
    expect(wagerRejectionCopy(undefined, 'Points', 0)).toMatch(/not accepted/i);
    expect(wagerRejectionCopy('brand_new_reason', 'Points', 0)).toMatch(/not accepted/i);
  });
});

describe('refresh() transient vs definitive (item 1)', () => {
  it('keeps the last round on a transient (undefined) fetch, clears on a definitive (null) fetch', async () => {
    vi.useFakeTimers();
    try {
      fetchActive.mockResolvedValueOnce(round(makePoll())); // initial
      const { result } = renderHook(() => useEngagement('streamer', false));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.poll?.id).toBe('poll-1');

      // Transient failure — must NOT clear the round.
      fetchActive.mockResolvedValueOnce(undefined);
      act(() => result.current.onWsFrame());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(result.current.poll?.id).toBe('poll-1');

      // Definitive "no round" — must clear.
      fetchActive.mockResolvedValueOnce(null);
      act(() => result.current.onWsFrame());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(result.current.poll).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('vote() optimistic rollback (item 1)', () => {
  it('restores the prior voted_option_id when the vote fails', async () => {
    const engaged: ViewerEngagement = { points_name: 'Points', balance: 10, voted_option_id: 'opt-1' };
    fetchActive.mockResolvedValue(round(makePoll()));
    fetchMe.mockResolvedValueOnce(engaged); // initial
    fetchMe.mockResolvedValue(null); // post-error refresh keeps existing engagement

    const { result } = renderHook(() => useEngagement('streamer', true));
    await act(async () => {});
    expect(result.current.engagement?.voted_option_id).toBe('opt-1');

    voteFn.mockResolvedValueOnce({ error: 'VOTE_FAILED' });
    await act(async () => {
      result.current.vote(2);
    });
    // Optimistic highlight rolled back to the prior choice, not left on opt-2.
    expect(result.current.engagement?.voted_option_id).toBe('opt-1');
  });
});

describe('vote() {status:"ok"} sentinel guard (item 5)', () => {
  it('does not overwrite the live poll with a bodyless accept response', async () => {
    fetchMe.mockResolvedValue(null);
    fetchActive.mockResolvedValueOnce(round(makePoll())); // initial
    const { result } = renderHook(() => useEngagement('streamer', false));
    await act(async () => {});
    expect(result.current.poll?.options?.length).toBe(2);

    // Backend accepted the vote but its GetPoll follow-up failed → 200 {status:"ok"}.
    // Hold the post-vote refresh pending so we observe the state the vote itself left.
    const activeAfter = deferred<StreamerActive | null | undefined>();
    fetchActive.mockReturnValueOnce(activeAfter.promise);
    voteFn.mockResolvedValueOnce({ poll: { status: 'ok' } as unknown as Poll });

    await act(async () => {
      result.current.vote(2);
    });
    // The sentinel (no id) must be ignored — the panel would otherwise blank.
    expect(result.current.poll?.id).toBe('poll-1');
    expect(result.current.poll?.options?.length).toBe(2);

    await act(async () => {
      activeAfter.resolve(round(makePoll()));
    });
  });
});

describe('auth toggle does not blank the public round (item 4)', () => {
  it('keeps poll/prediction rendered while the viewer snapshot refreshes on login', async () => {
    fetchActive.mockResolvedValueOnce(round(makePoll())); // initial (logged out)
    fetchMe.mockResolvedValue({ points_name: 'Points', balance: 5 });
    const { result, rerender } = renderHook(({ authed }) => useEngagement('streamer', authed), {
      initialProps: { authed: false },
    });
    await act(async () => {});
    expect(result.current.poll?.id).toBe('poll-1');

    // On login the public round must stay on screen; only the viewer snapshot refetches.
    const activeAfter = deferred<StreamerActive | null | undefined>();
    fetchActive.mockReturnValueOnce(activeAfter.promise);
    rerender({ authed: true });
    // Still visible even though the refetch is in flight (no pre-clear).
    expect(result.current.poll?.id).toBe('poll-1');

    await act(async () => {
      activeAfter.resolve(round(makePoll()));
    });
    expect(result.current.poll?.id).toBe('poll-1');
  });
});

describe('stale refresh cannot revert a fresh vote (item 1 sequencing)', () => {
  it('ignores an in-flight pre-vote refresh that resolves after the vote', async () => {
    vi.useFakeTimers();
    try {
      const activeQ: Deferred<StreamerActive | null | undefined>[] = [];
      const meQ: Deferred<ViewerEngagement | null>[] = [];
      fetchActive.mockImplementation(() => {
        const d = deferred<StreamerActive | null | undefined>();
        activeQ.push(d);
        return d.promise;
      });
      fetchMe.mockImplementation(() => {
        const d = deferred<ViewerEngagement | null>();
        meQ.push(d);
        return d.promise;
      });

      const { result } = renderHook(() => useEngagement('streamer', true));
      // Initial refresh (index 0).
      await act(async () => {
        activeQ[0].resolve(round(makePoll()));
        meQ[0].resolve({ points_name: 'Points', balance: 10, voted_option_id: undefined });
      });
      expect(result.current.poll?.id).toBe('poll-1');

      // A pre-vote refresh goes in flight (index 1) and is left PENDING (the stale one).
      act(() => result.current.onWsFrame());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(activeQ.length).toBe(2);

      // The viewer votes: optimistic highlight → opt-2, then the accepted vote resolves and
      // triggers its own reconciling refresh (index 2).
      voteFn.mockResolvedValueOnce({ poll: makePoll() });
      await act(async () => {
        result.current.vote(2);
      });
      expect(result.current.engagement?.voted_option_id).toBe('opt-2');

      // Now the STALE pre-vote refresh finally lands with the old (no-vote) snapshot.
      await act(async () => {
        activeQ[1].resolve(round(makePoll()));
        meQ[1].resolve({ points_name: 'Points', balance: 10, voted_option_id: undefined });
      });
      // It must NOT wipe the fresh vote.
      expect(result.current.engagement?.voted_option_id).toBe('opt-2');

      // Reconciling refresh (index 2) confirms the vote server-side.
      if (activeQ[2]) {
        await act(async () => {
          activeQ[2].resolve(round(makePoll()));
          meQ[2]?.resolve({ points_name: 'Points', balance: 10, voted_option_id: 'opt-2' });
        });
      }
      expect(result.current.engagement?.voted_option_id).toBe('opt-2');
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates vote()'s own seq bump: a stale refresh landing DURING the vote round-trip can't revert it", async () => {
    vi.useFakeTimers();
    try {
      const activeQ: Deferred<StreamerActive | null | undefined>[] = [];
      const meQ: Deferred<ViewerEngagement | null>[] = [];
      fetchActive.mockImplementation(() => {
        const d = deferred<StreamerActive | null | undefined>();
        activeQ.push(d);
        return d.promise;
      });
      fetchMe.mockImplementation(() => {
        const d = deferred<ViewerEngagement | null>();
        meQ.push(d);
        return d.promise;
      });

      const { result } = renderHook(() => useEngagement('streamer', true));
      await act(async () => {
        activeQ[0].resolve(round(makePoll()));
        meQ[0].resolve({ points_name: 'Points', balance: 10, voted_option_id: undefined });
      });

      // A pre-vote refresh goes in flight (index 1), left PENDING.
      act(() => result.current.onWsFrame());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(activeQ.length).toBe(2);

      // Vote, but hold the vote REQUEST itself pending — so its trailing refresh has NOT been
      // issued yet. Only vote()'s own up-front seqRef bump can protect the optimistic vote here.
      const voteResp = deferred<{ poll?: Poll; error?: string }>();
      voteFn.mockReturnValueOnce(voteResp.promise);
      await act(async () => {
        result.current.vote(2);
      });
      expect(result.current.engagement?.voted_option_id).toBe('opt-2');

      // Stale pre-vote refresh lands mid-round-trip with the old no-vote snapshot.
      await act(async () => {
        activeQ[1].resolve(round(makePoll()));
        meQ[1].resolve({ points_name: 'Points', balance: 10, voted_option_id: undefined });
      });
      // Without vote()'s seqRef bump this would revert to undefined; it must stay opt-2.
      expect(result.current.engagement?.voted_option_id).toBe('opt-2');

      // Vote finally resolves and reconciles.
      await act(async () => {
        voteResp.resolve({ poll: makePoll() });
      });
      if (activeQ[2]) {
        await act(async () => {
          activeQ[2].resolve(round(makePoll()));
          meQ[2]?.resolve({ points_name: 'Points', balance: 10, voted_option_id: 'opt-2' });
        });
      }
      expect(result.current.engagement?.voted_option_id).toBe('opt-2');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('wager() execution (item 3)', () => {
  it('applies the returned balance and prediction on a successful wager', async () => {
    fetchActive.mockResolvedValueOnce(roundP(makePrediction())); // initial
    fetchMe.mockResolvedValueOnce({ points_name: 'Points', balance: 1000 }); // initial
    const { result } = renderHook(() => useEngagement('streamer', true));
    await act(async () => {});
    expect(result.current.prediction?.id).toBe('pred-1');
    expect(result.current.engagement?.balance).toBe(1000);

    // Hold the reconciling refresh pending so we observe exactly what wager()'s handler wrote.
    const activeAfter = deferred<StreamerActive | null | undefined>();
    fetchActive.mockReturnValueOnce(activeAfter.promise);
    fetchMe.mockResolvedValue(null);

    wagerFn.mockResolvedValueOnce({
      balance: 500,
      prediction: makePrediction({
        outcomes: [
          { id: 'out-1', idx: 1, label: 'Yes', total_points: 600, entrants: 3 },
          { id: 'out-2', idx: 2, label: 'No', total_points: 50, entrants: 1 },
        ],
      }),
    });
    await act(async () => {
      result.current.wager(1, 500);
    });
    expect(wagerFn).toHaveBeenCalledWith('streamer', 'pred-1', 1, 500);
    expect(result.current.engagement?.balance).toBe(500);
    expect(result.current.prediction?.outcomes[0].total_points).toBe(600);
    expect(result.current.notice).toBeNull();

    await act(async () => {
      activeAfter.resolve(roundP(makePrediction()));
    });
  });

  it('rejects a client-side over-balance wager without calling the API', async () => {
    fetchActive.mockResolvedValue(roundP(makePrediction()));
    fetchMe.mockResolvedValue({ points_name: 'Gold', balance: 100 });
    const { result } = renderHook(() => useEngagement('streamer', true));
    await act(async () => {});

    await act(async () => {
      result.current.wager(1, 500); // 500 > balance 100
    });
    expect(wagerFn).not.toHaveBeenCalled();
    expect(result.current.notice).toMatch(/not enough gold/i);
    expect(result.current.notice).toContain('100');
    expect(result.current.engagement?.balance).toBe(100);
  });

  it('surfaces actionable rejection copy and leaves the balance unchanged when the wager bounces', async () => {
    fetchActive.mockResolvedValue(roundP(makePrediction()));
    fetchMe.mockResolvedValue({ points_name: 'Points', balance: 1000 });
    const { result } = renderHook(() => useEngagement('streamer', true));
    await act(async () => {});
    expect(result.current.engagement?.balance).toBe(1000);

    wagerFn.mockResolvedValueOnce({ error: 'WAGER_FAILED', reason: 'already_wagered' });
    await act(async () => {
      result.current.wager(1, 100);
    });
    expect(result.current.notice).toMatch(/already placed/i);
    expect(result.current.engagement?.balance).toBe(1000);
  });
});

describe('wager() insufficient copy reflects the fresh balance (item 5)', () => {
  it('shows the current balance in the rejection, not the stale submit-time value', async () => {
    vi.useFakeTimers();
    try {
      fetchActive.mockResolvedValue(roundP(makePrediction()));
      fetchMe.mockResolvedValueOnce({ points_name: 'Gold', balance: 1000 }); // initial
      const { result } = renderHook(() => useEngagement('streamer', true));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.engagement?.balance).toBe(1000);

      // Submit a wager that passes the client-side check (100 <= 1000), held in flight.
      const wagerResp = deferred<{ balance?: number; prediction?: Prediction; error?: string; reason?: string }>();
      wagerFn.mockReturnValueOnce(wagerResp.promise);
      await act(async () => {
        result.current.wager(1, 100);
      });

      // While the wager is in flight, an off-band refresh drops the balance to 50.
      fetchMe.mockResolvedValueOnce({ points_name: 'Gold', balance: 50 });
      act(() => result.current.onWsFrame());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(result.current.engagement?.balance).toBe(50);

      // The server now rejects the wager as insufficient — the copy must show the fresh 50,
      // not the 1,000 captured when the (memoized) wager callback was created.
      await act(async () => {
        wagerResp.resolve({ error: 'WAGER_FAILED', reason: 'insufficient' });
      });
      expect(result.current.notice).toContain('50');
      expect(result.current.notice).not.toContain('1,000');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('stale refresh cannot revert a fresh wager (item 1 sequencing)', () => {
  it('ignores an in-flight pre-wager refresh that resolves after the wager', async () => {
    vi.useFakeTimers();
    try {
      const activeQ: Deferred<StreamerActive | null | undefined>[] = [];
      const meQ: Deferred<ViewerEngagement | null>[] = [];
      fetchActive.mockImplementation(() => {
        const d = deferred<StreamerActive | null | undefined>();
        activeQ.push(d);
        return d.promise;
      });
      fetchMe.mockImplementation(() => {
        const d = deferred<ViewerEngagement | null>();
        meQ.push(d);
        return d.promise;
      });

      const { result } = renderHook(() => useEngagement('streamer', true));
      // Initial refresh (index 0).
      await act(async () => {
        activeQ[0].resolve(roundP(makePrediction()));
        meQ[0].resolve({ points_name: 'Points', balance: 1000 });
      });
      expect(result.current.engagement?.balance).toBe(1000);

      // A pre-wager refresh goes in flight (index 1) and is left PENDING (the stale one).
      act(() => result.current.onWsFrame());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(activeQ.length).toBe(2);

      // The viewer wagers: it resolves with the post-wager balance and triggers its own
      // reconciling refresh (index 2).
      wagerFn.mockResolvedValueOnce({ balance: 500, prediction: makePrediction() });
      await act(async () => {
        result.current.wager(1, 500);
      });
      expect(result.current.engagement?.balance).toBe(500);

      // Now the STALE pre-wager refresh finally lands with the old (pre-wager) balance.
      await act(async () => {
        activeQ[1].resolve(roundP(makePrediction()));
        meQ[1].resolve({ points_name: 'Points', balance: 1000 });
      });
      // It must NOT wipe the fresh wager balance.
      expect(result.current.engagement?.balance).toBe(500);

      // Reconciling refresh (index 2) confirms the wager server-side.
      if (activeQ[2]) {
        await act(async () => {
          activeQ[2].resolve(roundP(makePrediction()));
          meQ[2]?.resolve({ points_name: 'Points', balance: 500, wager_outcome_id: 'out-1', wager_amount: 500 });
        });
      }
      expect(result.current.engagement?.balance).toBe(500);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates wager()'s own seq bump: a stale refresh landing DURING the round-trip can't overwrite the balance", async () => {
    vi.useFakeTimers();
    try {
      const activeQ: Deferred<StreamerActive | null | undefined>[] = [];
      const meQ: Deferred<ViewerEngagement | null>[] = [];
      fetchActive.mockImplementation(() => {
        const d = deferred<StreamerActive | null | undefined>();
        activeQ.push(d);
        return d.promise;
      });
      fetchMe.mockImplementation(() => {
        const d = deferred<ViewerEngagement | null>();
        meQ.push(d);
        return d.promise;
      });

      const { result } = renderHook(() => useEngagement('streamer', true));
      await act(async () => {
        activeQ[0].resolve(roundP(makePrediction()));
        meQ[0].resolve({ points_name: 'Points', balance: 1000 });
      });
      expect(result.current.engagement?.balance).toBe(1000);

      // A pre-wager refresh goes in flight (index 1), left PENDING.
      act(() => result.current.onWsFrame());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(activeQ.length).toBe(2);

      // Wager, but hold the wager REQUEST itself pending — so its trailing reconciling refresh
      // has NOT been issued yet. Only wager()'s own up-front seqRef bump (line 243) can protect
      // the balance here.
      const wagerResp = deferred<{ balance?: number; prediction?: Prediction; error?: string }>();
      wagerFn.mockReturnValueOnce(wagerResp.promise);
      await act(async () => {
        result.current.wager(1, 400);
      });

      // The stale pre-wager refresh lands mid-round-trip carrying a DIVERGENT balance. That
      // divergence is the instrument that makes suppression observable — wager, unlike vote,
      // writes no optimistic state of its own. Without wager()'s seq bump this stale snapshot
      // would be applied (balance → 7777); with it, the refresh bails.
      await act(async () => {
        activeQ[1].resolve(roundP(makePrediction()));
        meQ[1].resolve({ points_name: 'Points', balance: 7777 });
      });
      expect(result.current.engagement?.balance).toBe(1000);

      // Wager finally resolves and reconciles to the true post-wager balance.
      await act(async () => {
        wagerResp.resolve({ balance: 600, prediction: makePrediction() });
      });
      expect(result.current.engagement?.balance).toBe(600);
      if (activeQ[2]) {
        await act(async () => {
          activeQ[2].resolve(roundP(makePrediction()));
          meQ[2]?.resolve({ points_name: 'Points', balance: 600, wager_outcome_id: 'out-1', wager_amount: 400 });
        });
      }
      expect(result.current.engagement?.balance).toBe(600);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('heartbeat balance write is sequence-guarded (item 1)', () => {
  it('does not clobber a fresh wager balance with a stale heartbeat value', async () => {
    vi.useFakeTimers();
    try {
      const activeQ: Deferred<StreamerActive | null | undefined>[] = [];
      const meQ: Deferred<ViewerEngagement | null>[] = [];
      fetchActive.mockImplementation(() => {
        const d = deferred<StreamerActive | null | undefined>();
        activeQ.push(d);
        return d.promise;
      });
      fetchMe.mockImplementation(() => {
        const d = deferred<ViewerEngagement | null>();
        meQ.push(d);
        return d.promise;
      });
      // The heartbeat fires but resolves LATE, carrying the stale pre-wager balance.
      const hb = deferred<number | null>();
      heartbeat.mockReturnValueOnce(hb.promise);

      const { result } = renderHook(() => useEngagement('streamer', true));
      await act(async () => {
        activeQ[0].resolve(roundP(makePrediction()));
        meQ[0].resolve({ points_name: 'Points', balance: 1000 });
      });
      expect(result.current.engagement?.balance).toBe(1000);

      // Advance to fire the 60s heartbeat (it captures seqRef *before* the wager), held pending.
      // The 15s live-round interval also fires here; its refreshes are left pending and don't
      // matter — the point is only that the heartbeat captured its seq before the wager.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      // Viewer wagers → balance 500, advancing seqRef past the heartbeat's captured value.
      wagerFn.mockResolvedValueOnce({ balance: 500, prediction: makePrediction() });
      await act(async () => {
        result.current.wager(1, 500);
      });
      expect(result.current.engagement?.balance).toBe(500);

      // The stale heartbeat finally resolves carrying the pre-wager 1000 — it must be dropped.
      await act(async () => {
        hb.resolve(1000);
      });
      expect(result.current.engagement?.balance).toBe(500);
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies the balance the heartbeat returns in place, without an extra /active fetch when idle', async () => {
    vi.useFakeTimers();
    try {
      fetchActive.mockResolvedValue(null); // no live round → no 15s polling, mirrors an idle viewer
      fetchMe.mockResolvedValueOnce({ points_name: 'Points', balance: 1000 });
      heartbeat.mockResolvedValueOnce(1200); // watch-time award raised the balance
      const { result } = renderHook(() => useEngagement('streamer', true));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.engagement?.balance).toBe(1000);
      const activeCallsBefore = fetchActive.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(heartbeat).toHaveBeenCalledTimes(1);
      // Balance updated straight from the heartbeat's own return value...
      expect(result.current.engagement?.balance).toBe(1200);
      // ...with NO extra /active fetch — the "no polling when nothing is live" design holds.
      expect(fetchActive.mock.calls.length).toBe(activeCallsBefore);
    } finally {
      vi.useRealTimers();
    }
  });
});
