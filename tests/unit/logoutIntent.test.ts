import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markIntentionalLogout, wasIntentionalLogout, clearLogoutIntent } from '../../src/lib/storage';

/**
 * The intentional-logout marker (item 2): a deliberate "Sign out" writes a timestamp so the
 * token-removal recovery listener stays silent, while a genuine expiry (no marker) still
 * surfaces "Session expired". The check is a non-destructive PEEK — the single token removal
 * fires storage.onChanged in every extension context (iframe + pop-out), so all must read the
 * marker and stay silent; a destructive read would let a losing context still toast. Backed by
 * a minimal in-memory chrome.storage.local mock.
 */
let store: Record<string, unknown> = {};
beforeEach(() => {
  store = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: {
        get: (_keys: unknown, cb: (items: Record<string, unknown>) => void) => cb({ ...store }),
        set: (items: Record<string, unknown>, cb: () => void) => {
          Object.assign(store, items);
          cb();
        },
        remove: (keys: string | string[], cb: () => void) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
          cb();
        },
      },
    },
  };
});

describe('logout intent marker', () => {
  it('reads a marker as intentional without consuming it (multi-context safe)', async () => {
    await markIntentionalLogout();
    expect(store.viewer_logout_intent).toBeTypeOf('number');

    // A PEEK: every context that reads it sees intentional=true, and the marker survives
    // (so a second listener/window can't lose a race and toast).
    expect(await wasIntentionalLogout()).toBe(true);
    expect(await wasIntentionalLogout()).toBe(true);
    expect(store.viewer_logout_intent).toBeTypeOf('number');
  });

  it('treats a missing marker (genuine expiry) as not intentional', async () => {
    expect(await wasIntentionalLogout()).toBe(false);
  });

  it('clears the marker on login so it cannot outlive its logout', async () => {
    await markIntentionalLogout();
    await clearLogoutIntent();
    expect(store.viewer_logout_intent).toBeUndefined();
    expect(await wasIntentionalLogout()).toBe(false);
  });

  it('honors a marker regardless of age — it is cleared by login, not by elapsed time (item 8)', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    await markIntentionalLogout();
    // Jump far into the future: with no TTL, the marker is STILL honored. This is what closes
    // the multi-context race — a >TTL-delayed onChanged in a second context can no longer read
    // the marker as expired and wrongly toast "Session expired" after a deliberate logout. The
    // marker is invalidated only by a subsequent login (see the clearLogoutIntent test above).
    nowSpy.mockReturnValue(1_000_000 + 3_600_000);
    expect(await wasIntentionalLogout()).toBe(true);
    nowSpy.mockRestore();
  });
});
