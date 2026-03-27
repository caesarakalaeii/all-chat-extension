---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/components/MessageInput.tsx
  - src/ui/components/ChatContainer.tsx
autonomous: true
requirements: [ISSUE-20]

must_haves:
  truths:
    - "Sending a message no longer produces a floating toast overlay"
    - "User sees a brief green border flash and checkmark on the input after sending"
    - "Inline feedback fades out after approximately 1 second"
    - "Error, warning, and login toasts remain fully functional"
  artifacts:
    - path: "src/ui/components/MessageInput.tsx"
      provides: "Inline send-success feedback (green border flash + checkmark)"
      contains: "sentSuccess"
    - path: "src/ui/components/ChatContainer.tsx"
      provides: "handleMessageSent no longer calls addToast for success"
  key_links:
    - from: "src/ui/components/ChatContainer.tsx"
      to: "src/ui/components/MessageInput.tsx"
      via: "onSendSuccess prop callback"
      pattern: "onSendSuccess"
---

<objective>
Replace the "Message sent" toast with inline feedback in the message input.

Purpose: Reduce visual noise for active chatters by replacing the floating toast with a brief green border flash and checkmark icon scoped to the input field (Issue #20, Option A).
Output: Updated MessageInput.tsx with inline feedback state; updated ChatContainer.tsx with toast call removed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/ui/components/MessageInput.tsx
@src/ui/components/ChatContainer.tsx

<interfaces>
From src/ui/components/MessageInput.tsx:
```typescript
interface MessageInputProps {
  platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';
  streamer: string;
  token: string;
  onSendSuccess?: () => void;
  onAuthError?: () => void;
}
```

From src/ui/components/ChatContainer.tsx (line 320-322):
```typescript
const handleMessageSent = () => {
  addToast('Message sent', 'success', 2000);
};
```

Passed as:
```tsx
<MessageInput
  ...
  onSendSuccess={handleMessageSent}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add inline send-success feedback to MessageInput</name>
  <files>src/ui/components/MessageInput.tsx</files>
  <action>
Add a `sentSuccess` boolean state (default false) to MessageInput.

On successful send (line 198, after `onSendSuccess?.()`):
1. Set `sentSuccess` to `true`
2. After ~1000ms, set it back to `false` using setTimeout (clear on unmount via useEffect cleanup)

Update the input element's className to conditionally apply a green border when `sentSuccess` is true:
- Normal: `border-border` (existing)
- Success: `border-green-500` with a CSS transition for smooth fade. Add `transition-colors duration-300` to the input className.

Add a small checkmark icon inside the input wrapper (the `div.flex-1.relative` on line 231). When `sentSuccess` is true, render an absolutely positioned checkmark SVG on the right side of the input:
```tsx
{sentSuccess && (
  <svg
    className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500 animate-fade-out pointer-events-none"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)}
```

Add a `pr-8` padding-right to the input when `sentSuccess` is true so text does not overlap the checkmark.

For the fade-out animation, add a Tailwind 4 @keyframes + @utility in styles.css:
```css
@keyframes fade-out {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}

@utility animate-fade-out {
  animation: fade-out 1s ease-out forwards;
}
```

Important: Do NOT change the `onSendSuccess` prop interface. The callback still fires as before.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>MessageInput shows a green border flash and checkmark icon for ~1s after successful send, then reverts to normal state. No type errors.</done>
</task>

<task type="auto">
  <name>Task 2: Remove "Message sent" toast from ChatContainer</name>
  <files>src/ui/components/ChatContainer.tsx</files>
  <action>
In ChatContainer.tsx, update `handleMessageSent` (line 320-322) to remove the `addToast('Message sent', 'success', 2000)` call. The function body should be empty or contain only a comment:

```typescript
const handleMessageSent = () => {
  // Inline feedback handled by MessageInput — no toast needed
};
```

Do NOT remove or rename `handleMessageSent` itself — it is still passed as `onSendSuccess` prop.
Do NOT touch any other addToast calls (logout, auth error, connection status, etc.).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -30 && grep -n "addToast" src/ui/components/ChatContainer.tsx</automated>
  </verify>
  <done>The "Message sent" toast call is removed. All other addToast calls (logout, session expired, connection) remain. TypeScript compiles cleanly.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npm run build` succeeds
3. `grep "addToast.*Message sent" src/ui/components/ChatContainer.tsx` returns no matches
4. `grep "sentSuccess" src/ui/components/MessageInput.tsx` returns matches confirming inline feedback state exists
</verification>

<success_criteria>
- Sending a message no longer shows a floating "Message sent" toast
- The input border briefly flashes green with a checkmark icon after successful send
- The feedback fades out after ~1 second
- All error/warning/login toasts continue to work unchanged
- TypeScript compiles without errors
- Build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/260327-kbw-implement-issue-20-replace-message-sent-/260327-kbw-SUMMARY.md`
</output>
