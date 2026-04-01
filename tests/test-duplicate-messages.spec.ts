/**
 * Duplicate message deduplication tests.
 *
 * Regression tests for the bug where the same chat message appeared twice for
 * the sender in the extension chat UI (but only once in the overlay and native chat).
 *
 * The deduplication guard uses message ID to skip adding a message that is already
 * present in the messages state array.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Duplicate message deduplication — static source checks', () => {
  test('ChatContainer setMessages add path includes ID deduplication guard', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/ui/components/ChatContainer.tsx'
    );
    const source = fs.readFileSync(filePath, 'utf8');

    // The guard must be guarded by a truthy-ID check to avoid dropping messages
    // with falsy IDs (undefined or empty string).
    expect(source).toContain('processedMessage.id && prev.some((m) => m.id === processedMessage.id)');

    // The guard must return the previous state unchanged when a duplicate is found
    const guardIndex = source.indexOf('processedMessage.id && prev.some((m) => m.id === processedMessage.id)');
    expect(guardIndex).toBeGreaterThan(-1);

    // Ensure the guard appears before the spread-append pattern in the same block
    const addPatternIndex = source.indexOf('[...prev, processedMessage].slice(-50)');
    expect(addPatternIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(addPatternIndex);
  });

  test('ChatContainer update-in-place path does NOT add new message when ID not found', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/ui/components/ChatContainer.tsx'
    );
    const source = fs.readFileSync(filePath, 'utf8');

    // The update-in-place callback must return prev (not add) when existingIndex === -1.
    // This means the else-branch that previously called [...prev, enrichedMessage] must be gone.
    expect(source).not.toContain('[...prev, enrichedMessage]');

    // The update path must still update in-place when the message IS found
    expect(source).toContain('updated[existingIndex] = enrichedMessage');
  });

  test('ChatContainer message handler is registered exactly once in the useEffect with empty deps', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/ui/components/ChatContainer.tsx'
    );
    const source = fs.readFileSync(filePath, 'utf8');

    // Count addEventListener for message — should appear exactly once (add) and once (remove)
    const addCount = (source.match(/window\.addEventListener\('message', handleMessage\)/g) || []).length;
    const removeCount = (source.match(/window\.removeEventListener\('message', handleMessage\)/g) || []).length;

    expect(addCount).toBe(1);
    expect(removeCount).toBe(1);
  });
});

test.describe('Duplicate message deduplication — logic contract tests', () => {
  test('deduplication logic correctly rejects duplicate ID in isolation', () => {
    // Simulate the setMessages updater function's deduplication logic.
    // This tests the guard logic in isolation without React or the extension.
    const processedMessage = {
      id: 'test-uuid-001',
      platform: 'youtube',
      message: { text: 'Hello world', emotes: [] },
    } as any;

    // Simulated state updater — mirrors the ChatContainer setMessages call
    const withDedup = (prev: any[]) => {
      if (processedMessage.id && prev.some((m) => m.id === processedMessage.id)) {
        return prev; // Duplicate — discard
      }
      return [...prev, processedMessage].slice(-50);
    };

    // First delivery: empty state → message should be added
    const after1 = withDedup([]);
    expect(after1).toHaveLength(1);
    expect(after1[0].id).toBe('test-uuid-001');

    // Second delivery (duplicate): message should NOT be added again
    const after2 = withDedup(after1);
    expect(after2).toHaveLength(1);
    expect(after2).toBe(after1); // Same reference — no state change

    // A DIFFERENT message should still be added
    const differentMessage = { id: 'test-uuid-002', platform: 'twitch', message: { text: 'Other', emotes: [] } };
    const withDedup2 = (prev: any[]) => {
      if (differentMessage.id && prev.some((m) => m.id === differentMessage.id)) {
        return prev;
      }
      return [...prev, differentMessage].slice(-50);
    };
    const after3 = withDedup2(after1);
    expect(after3).toHaveLength(2);
  });

  test('deduplication guard does NOT drop messages when ID is falsy', () => {
    // Regression test: guard must not drop subsequent messages when id is undefined or "".
    // Before the fix, the guard used `prev.some((m) => m.id === processedMessage.id)` without
    // checking that id is truthy first. With id=undefined, undefined===undefined is true,
    // so every message after the first would be silently dropped.

    const makeMsg = (id: string | undefined, text: string) => ({
      id,
      platform: 'twitch',
      message: { text, emotes: [] },
    }) as any;

    // Test with id = undefined
    const withDedupUndefined = (msg: any) => (prev: any[]) => {
      if (msg.id && prev.some((m: any) => m.id === msg.id)) {
        return prev;
      }
      return [...prev, msg].slice(-50);
    };

    const msg1 = makeMsg(undefined, 'first');
    const msg2 = makeMsg(undefined, 'second');
    const msg3 = makeMsg(undefined, 'third');

    const after1 = withDedupUndefined(msg1)([]);
    expect(after1).toHaveLength(1);

    const after2 = withDedupUndefined(msg2)(after1);
    expect(after2).toHaveLength(2); // Must NOT be dropped

    const after3 = withDedupUndefined(msg3)(after2);
    expect(after3).toHaveLength(3); // Must NOT be dropped

    // Test with id = "" (empty string)
    const msgEmpty1 = makeMsg('', 'first empty');
    const msgEmpty2 = makeMsg('', 'second empty');

    const withDedupEmpty = (msg: any) => (prev: any[]) => {
      if (msg.id && prev.some((m: any) => m.id === msg.id)) {
        return prev;
      }
      return [...prev, msg].slice(-50);
    };

    const afterE1 = withDedupEmpty(msgEmpty1)([]);
    expect(afterE1).toHaveLength(1);

    const afterE2 = withDedupEmpty(msgEmpty2)(afterE1);
    expect(afterE2).toHaveLength(2); // Must NOT be dropped
  });

  test('update-in-place logic correctly replaces without adding a duplicate', () => {
    const processedMessage = {
      id: 'test-uuid-001',
      platform: 'twitch',
      user: { badges: [{ name: 'subscriber', version: '0', icon_url: '' }] },
      message: { text: 'Test', emotes: [] },
    } as any;

    const enrichedMessage = {
      ...processedMessage,
      user: {
        ...processedMessage.user,
        badges: [{ name: 'subscriber', version: '0', icon_url: 'https://example.com/badge.png' }],
      },
    } as any;

    // State after the initial add
    const stateAfterAdd = [processedMessage];

    // Simulate the update-in-place setMessages callback
    const updateInPlace = (prev: any[]) => {
      const existingIndex = prev.findIndex((m) => m.id === enrichedMessage.id);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = enrichedMessage;
        return updated.slice(-50);
      }
      // Message was evicted — discard
      return prev;
    };

    const after = updateInPlace(stateAfterAdd);
    // Length must remain 1 (no duplicate added)
    expect(after).toHaveLength(1);
    // The badge icon should now be resolved
    expect(after[0].user.badges[0].icon_url).toBe('https://example.com/badge.png');
  });
});
