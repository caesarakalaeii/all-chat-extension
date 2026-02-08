# Bug Analysis: Chat Context Not Switching Between Streamers

## Summary
When navigating from one Twitch streamer to another (e.g., caesarlp → another streamer), the All-Chat extension creates a new iframe/container **without removing the old one first**, causing the chat context to remain on the previous streamer or show mixed messages.

## Evidence from Testing
The Playwright test revealed this log message:
```
[AllChat Twitch] Found 2 containers, removing duplicates...
```

This confirms that multiple containers are being created during streamer switches.

## Root Cause

### File: `src/content-scripts/base/PlatformDetector.ts`

The `init()` method (lines 49-86) is called when:
1. The extension first loads on a Twitch page
2. **When the URL changes** (detected by `setupUrlWatcher()` in twitch.ts:294-308)

**The Problem:** The `init()` method does NOT clean up existing UI before creating new UI:

```typescript
async init(): Promise<void> {
  // ... extract username, check if streamer exists ...

  // Line 72-79: Creates NEW container without removing OLD one
  this.hideNativeChat();
  const container = this.createInjectionPoint();  // ❌ Creates duplicate!
  if (!container) {
    return;
  }
  this.injectAllChatUI(container, username);  // ❌ Injects duplicate iframe!

  await this.connectWebSocket(username);
}
```

### What Happens During Streamer Switch:

1. **User navigates:** caesarlp → pokimane
2. **URL watcher detects change** (twitch.ts:299-305)
3. **Calls `init()` again** (twitch.ts:304)
4. **`init()` creates a NEW container** without removing the old one
5. **Result:**
   - Container #1: iframe with `data-streamer="caesarlp"`
   - Container #2: iframe with `data-streamer="pokimane"`
6. **MutationObserver cleanup** (twitch.ts:252-260) eventually removes duplicates
7. **BUT:** There's a race condition - it might:
   - Keep the wrong iframe
   - Messages may have already been relayed to both iframes
   - The WebSocket might still be connected to the old streamer context

## The Fix

**Location:** `src/content-scripts/base/PlatformDetector.ts` lines 71-72

**Before (current code):**
```typescript
async init(): Promise<void> {
  console.log(`[AllChat ${this.platform}] Initializing...`);

  const username = this.extractStreamerUsername();
  if (!username) {
    console.log(`[AllChat ${this.platform}] Could not extract streamer username`);
    return;
  }

  // ... check if streamer exists ...

  // Hide native chat and inject All-Chat
  this.hideNativeChat();
  const container = this.createInjectionPoint();
```

**After (fixed):**
```typescript
async init(): Promise<void> {
  console.log(`[AllChat ${this.platform}] Initializing...`);

  const username = this.extractStreamerUsername();
  if (!username) {
    console.log(`[AllChat ${this.platform}] Could not extract streamer username`);
    return;
  }

  // ... check if streamer exists ...

  // Clean up existing UI before creating new one (fixes streamer switching bug)
  this.removeAllChatUI();

  // Hide native chat and inject All-Chat
  this.hideNativeChat();
  const container = this.createInjectionPoint();
```

## Additional Considerations

### WebSocket Reconnection
When switching streamers, the WebSocket connection should also be properly closed for the old streamer and opened for the new one. The current `connectWebSocket()` call (line 82) might need additional logic to:
1. Close existing WebSocket connection
2. Clear message state
3. Connect to new streamer's chat

This is handled by the service worker, so we should verify the service worker properly handles streamer context switching.

## Test Case to Verify Fix

1. Navigate to `twitch.tv/caesarlp`
2. Verify All-Chat container appears with `data-streamer="caesarlp"`
3. Navigate to `twitch.tv/pokimane`
4. Verify:
   - Only ONE All-Chat container exists
   - The iframe has `data-streamer="pokimane"`
   - No duplicates are created (no "Found 2 containers" log)
   - Chat messages are from the new streamer
   - WebSocket is connected to the new streamer

## Files to Modify

1. **src/content-scripts/base/PlatformDetector.ts** (line 71) - Add `this.removeAllChatUI()`
2. **src/background/service-worker.ts** (verify WebSocket handling) - Ensure old connections are closed
