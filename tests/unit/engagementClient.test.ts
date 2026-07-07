import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as client from '../../src/lib/engagementClient';
import type { StreamerActive } from '../../src/lib/types/engagement';

// engagementClient is a thin wrapper over chrome.runtime.sendMessage (the SW proxy).
// Stub chrome so we can assert how each SW response is mapped for the hook.
const sendMessage = vi.fn();
beforeEach(() => {
  sendMessage.mockReset();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
  };
});

const activePayload: StreamerActive = { points_name: 'Points', poll: null, prediction: null };

describe('fetchActive tri-state (transient vs definitive)', () => {
  it('maps a transient SW failure to undefined so the caller keeps the last render', async () => {
    sendMessage.mockResolvedValue({ success: false, error: 'ACTIVE_FAILED' });
    await expect(client.fetchActive('streamer')).resolves.toBeUndefined();
  });

  it('maps a definitive "no round" (success + null data) to null so the caller clears', async () => {
    sendMessage.mockResolvedValue({ success: true, data: null });
    await expect(client.fetchActive('streamer')).resolves.toBeNull();
  });

  it('returns the round object when one is live', async () => {
    sendMessage.mockResolvedValue({ success: true, data: activePayload });
    await expect(client.fetchActive('streamer')).resolves.toEqual(activePayload);
  });

  it('maps a thrown/asleep service worker to undefined (transient)', async () => {
    sendMessage.mockRejectedValue(new Error('Could not establish connection'));
    await expect(client.fetchActive('streamer')).resolves.toBeUndefined();
  });
});

describe('vote() result mapping', () => {
  it('surfaces an error without a poll when the SW reports failure', async () => {
    sendMessage.mockResolvedValue({ success: false, error: 'VOTE_FAILED' });
    await expect(client.vote('s', 'poll-1', 1)).resolves.toEqual({ error: 'VOTE_FAILED' });
  });
});

describe('wager() result mapping', () => {
  it('carries the machine-readable rejection reason through on failure', async () => {
    sendMessage.mockResolvedValue({ success: false, error: 'WAGER_FAILED', data: { reason: 'insufficient' } });
    await expect(client.wager('s', 'pred-1', 1, 500)).resolves.toEqual({
      error: 'WAGER_FAILED',
      reason: 'insufficient',
    });
  });
});
