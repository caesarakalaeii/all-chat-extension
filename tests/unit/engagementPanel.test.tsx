import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EngagementPanel from '../../src/ui/components/EngagementPanel';
import type {
  Poll,
  Prediction,
  ViewerEngagement,
  EngagementSource,
  PollState,
  PredictionState,
} from '../../src/lib/types/engagement';

function makePoll(over: Partial<Poll> = {}): Poll {
  return {
    id: 'poll-1',
    source: 'allchat' as EngagementSource,
    question: 'Best language?',
    state: 'ACTIVE' as PollState,
    allow_change: true,
    options: [
      { id: 'opt-1', idx: 1, label: 'Rust', votes: 3 },
      { id: 'opt-2', idx: 2, label: 'Go', votes: 1 },
    ],
    created_at: '2026-07-07T00:00:00Z',
    ...over,
  };
}

function makePrediction(over: Partial<Prediction> = {}): Prediction {
  return {
    id: 'pred-1',
    source: 'allchat' as EngagementSource,
    title: 'Will they win?',
    state: 'ACTIVE' as PredictionState,
    outcomes: [
      { id: 'out-1', idx: 1, label: 'Yes', total_points: 100, entrants: 2 },
      { id: 'out-2', idx: 2, label: 'No', total_points: 50, entrants: 1 },
    ],
    created_at: '2026-07-07T00:00:00Z',
    ...over,
  };
}

const noop = () => {};

function renderPanel(props: Partial<React.ComponentProps<typeof EngagementPanel>> = {}) {
  const onVote = vi.fn();
  const onWager = vi.fn();
  render(
    <EngagementPanel
      poll={null}
      prediction={null}
      engagement={null}
      pointsName="Points"
      busy={false}
      notice={null}
      authed={true}
      canLogin={true}
      onVote={onVote}
      onWager={onWager}
      onRequestLogin={noop}
      onDismissNotice={noop}
      loginPending={false}
      {...props}
    />,
  );
  return { onVote, onWager };
}

describe('EngagementPanel — currency isolation (native rounds are read-only)', () => {
  it('disables poll options and never fires onVote for a mirrored Twitch-native poll', () => {
    const { onVote } = renderPanel({ poll: makePoll({ source: 'twitch_native' }) });
    const opt = screen.getByRole('button', { name: /Rust/ });
    expect(opt).toBeDisabled();
    fireEvent.click(opt);
    expect(onVote).not.toHaveBeenCalled();
    expect(screen.getByText(/vote in Twitch chat/i)).toBeInTheDocument();
  });

  it('disables prediction outcomes and never fires onWager for a native prediction', () => {
    const { onWager } = renderPanel({
      prediction: makePrediction({ source: 'twitch_native' }),
      engagement: { points_name: 'Points', balance: 1000 },
    });
    const out = screen.getByRole('button', { name: /Yes/ });
    expect(out).toBeDisabled();
    fireEvent.click(out);
    expect(onWager).not.toHaveBeenCalled();
  });
});

describe('EngagementPanel — All-Chat poll voting', () => {
  it('lets an authed viewer vote on an ACTIVE All-Chat poll', () => {
    const { onVote } = renderPanel({ poll: makePoll() });
    const opt = screen.getByRole('button', { name: /Go/ });
    expect(opt).not.toBeDisabled();
    fireEvent.click(opt);
    expect(onVote).toHaveBeenCalledWith(2);
  });

  it('does not offer voting to a logged-out viewer', () => {
    const { onVote } = renderPanel({ poll: makePoll(), authed: false });
    const opt = screen.getByRole('button', { name: /Rust/ });
    expect(opt).toBeDisabled();
    fireEvent.click(opt);
    expect(onVote).not.toHaveBeenCalled();
  });
});

describe('EngagementPanel — poll.allow_change (item 3)', () => {
  const voted: ViewerEngagement = { points_name: 'Points', balance: 0, voted_option_id: 'opt-1' };

  it('locks the options and shows a hint once a viewer has voted on an allow_change:false poll', () => {
    const { onVote } = renderPanel({
      poll: makePoll({ allow_change: false }),
      engagement: voted,
    });
    // The option the viewer did NOT pick must be locked (no silent revert flicker).
    const other = screen.getByRole('button', { name: /Go/ });
    expect(other).toBeDisabled();
    fireEvent.click(other);
    expect(onVote).not.toHaveBeenCalled();
    expect(screen.getByText(/locked in your vote/i)).toBeInTheDocument();
  });

  it('still allows re-voting when allow_change is true', () => {
    const { onVote } = renderPanel({
      poll: makePoll({ allow_change: true }),
      engagement: voted,
    });
    const other = screen.getByRole('button', { name: /Go/ });
    expect(other).not.toBeDisabled();
    fireEvent.click(other);
    expect(onVote).toHaveBeenCalledWith(2);
    expect(screen.queryByText(/locked in your vote/i)).not.toBeInTheDocument();
  });
});

describe('EngagementPanel — All-Chat wager (item 3)', () => {
  it('lets an authed viewer type an amount and wager it on an outcome', () => {
    const { onWager } = renderPanel({
      prediction: makePrediction(),
      engagement: { points_name: 'Points', balance: 1000 },
    });
    const input = screen.getByLabelText(/amount to wager/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '250' } });
    const yes = screen.getByRole('button', { name: /Yes/ });
    fireEvent.click(yes);
    expect(onWager).toHaveBeenCalledWith(1, 250);
  });

  it('does not offer wagering to a logged-out viewer', () => {
    const { onWager } = renderPanel({ prediction: makePrediction(), authed: false, engagement: null });
    expect(screen.queryByLabelText(/amount to wager/i)).not.toBeInTheDocument();
    const yes = screen.getByRole('button', { name: /Yes/ });
    expect(yes).toBeDisabled();
    fireEvent.click(yes);
    expect(onWager).not.toHaveBeenCalled();
  });

  it('hides the wager input until the viewer snapshot has loaded (item 7)', () => {
    // authed but engagement still null (transient /me failure): showing the input would let a
    // wager compute balance=0 and bounce with "you have 0" even for a viewer who has points.
    const { onWager } = renderPanel({ prediction: makePrediction(), authed: true, engagement: null });
    expect(screen.queryByLabelText(/amount to wager/i)).not.toBeInTheDocument();
    const yes = screen.getByRole('button', { name: /Yes/ });
    expect(yes).toBeDisabled();
    fireEvent.click(yes);
    expect(onWager).not.toHaveBeenCalled();
  });
});

describe('EngagementPanel — CANCELED prediction (item 6)', () => {
  it('reveals a refund message during the cancel grace window instead of vanishing', () => {
    renderPanel({
      prediction: makePrediction({ state: 'CANCELED' }),
      engagement: { points_name: 'Points', balance: 500, wager_outcome_id: 'out-1', wager_amount: 250 },
    });
    expect(screen.getByText(/Will they win\?/)).toBeInTheDocument();
    expect(screen.getAllByText(/canceled/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/your wager was refunded/i)).toBeInTheDocument();
  });
});
