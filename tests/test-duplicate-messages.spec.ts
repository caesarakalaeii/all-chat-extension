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

    // The guard must check whether a message with the same ID already exists
    // before appending to the messages array.
    expect(source).toContain('prev.some((m) => m.id === processedMessage.id)');

    // The guard must return the previous state unchanged when a duplicate is found
    const guardIndex = source.indexOf('prev.some((m) => m.id === processedMessage.id)');
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
      if (prev.some((m) => m.id === processedMessage.id)) {
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
      if (prev.some((m) => m.id === differentMessage.id)) {
        return prev;
      }
      return [...prev, differentMessage].slice(-50);
    };
    const after3 = withDedup2(after1);
    expect(after3).toHaveLength(2);
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

test.describe('Optimistic message replacement via client_message_id', () => {
  // Mirrors the setMessages updater logic in ChatContainer
  const addMessage = (prev: any[], processedMessage: any) => {
    if (prev.some((m: any) => m.id === processedMessage.id)) {
      return prev;
    }
    if (processedMessage.client_message_id) {
      const optimisticIdx = prev.findIndex(
        (m: any) => m.client_message_id === processedMessage.client_message_id
      );
      if (optimisticIdx !== -1) {
        const updated = [...prev];
        updated[optimisticIdx] = processedMessage;
        return updated;
      }
    }
    return [...prev, processedMessage].slice(-50);
  };

  test('replaces optimistic message when server echo has matching client_message_id', () => {
    const optimisticMessage = {
      id: 'optimistic-abc123',
      client_message_id: 'abc123',
      platform: 'twitch',
      user: { username: 'testuser', display_name: 'TestUser', badges: [] },
      message: { text: 'Hello world', emotes: [] },
    } as any;

    const serverMessage = {
      id: 'server-uuid-001',
      client_message_id: 'abc123',
      platform: 'twitch',
      user: { username: 'testuser', display_name: 'TestUser', badges: [{ name: 'subscriber', version: '0', icon_url: 'https://example.com/badge.png' }] },
      message: { text: 'Hello world', emotes: [] },
    } as any;

    const after = addMessage([optimisticMessage], serverMessage);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe('server-uuid-001');
    expect(after[0].user.badges).toHaveLength(1);
  });

  test('does not replace when client_message_id does not match', () => {
    const optimisticMessage = {
      id: 'optimistic-abc123',
      client_message_id: 'abc123',
      platform: 'twitch',
      user: { username: 'testuser', display_name: 'TestUser', badges: [] },
      message: { text: 'Hello world', emotes: [] },
    } as any;

    const differentMessage = {
      id: 'server-uuid-002',
      client_message_id: 'xyz789',
      platform: 'twitch',
      user: { username: 'otheruser', display_name: 'OtherUser', badges: [] },
      message: { text: 'Different message', emotes: [] },
    } as any;

    const after = addMessage([optimisticMessage], differentMessage);
    expect(after).toHaveLength(2);
    expect(after[0].id).toBe('optimistic-abc123');
    expect(after[1].id).toBe('server-uuid-002');
  });

  test('adds normally when server message has no client_message_id', () => {
    const existingMessage = {
      id: 'existing-001',
      platform: 'twitch',
      user: { username: 'someone', badges: [] },
      message: { text: 'Earlier', emotes: [] },
    } as any;

    const newMessage = {
      id: 'server-uuid-003',
      platform: 'twitch',
      user: { username: 'otheruser', badges: [] },
      message: { text: 'New message', emotes: [] },
    } as any;

    const after = addMessage([existingMessage], newMessage);
    expect(after).toHaveLength(2);
    expect(after[1].id).toBe('server-uuid-003');
  });
});
