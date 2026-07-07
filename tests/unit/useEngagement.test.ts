import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEngagement, wagerRejectionCopy } from '../../src/ui/hooks/useEngagement';
import type { Poll, StreamerActive, ViewerEngagement } from '../../src/lib/types/engagement';

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

beforeEach(() => {
  fetchActive.mockReset();
  fetchMe.mockReset();
  voteFn.mockReset();
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
