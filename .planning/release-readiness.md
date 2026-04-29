# Release readiness audit — `feat/inject-ui`

Audit performed 2026-04-27. Branch is **not** ready to tag/release. Concrete punch list below.

## Context snapshot at time of audit

- 68 commits ahead of `main` (29 in the last 2 weeks)
- Working tree: 10 modified source files (uncommitted), ~50 untracked screenshot/debug artifacts at repo root
- `manifest.json` still at `1.6.1`
- Includes one explicit `wip(...)` commit in history
- Scroll-indicator fix (today's work) is in the working tree, **uncommitted**

---

## Hard blockers (must fix before tagging)

### 1. TypeScript errors break `npm run type-check`
Six errors, all in pre-existing branch code (not introduced by today's scroll fix):

| File | Line | Error |
|---|---|---|
| `src/background/service-worker.ts` | 215 | `"SEND_NATIVE_CHAT"` isn't in the message-type union — extend the union or rename |
| `src/content-scripts/youtube.ts` | 822 | `HTMLCollection` not iterable — wrap with `Array.from(...)` |
| `src/content-scripts/youtube.ts` | 837 | Same as above |
| `src/content-scripts/youtube.ts` | 1323 | `NodeListOf<HTMLScriptElement>` not iterable — same fix |
| `src/ui/components/ChatContainer.tsx` | 869 | `unknown` assigned to `ReactNode` — narrow with a type guard or cast |
| `src/ui/components/MessageInput.tsx` | 245 | `UnauthorizedError` missing required `platform` field — add it where the error is constructed |

CI almost certainly runs type-check; needs to be green.

### 2. Working tree is dirty
Today's scroll-indicator fix sits in `src/ui/components/ChatContainer.tsx` alongside 9 other modified files from earlier work. Commit the scroll fix as **one isolated commit** so it's revertable independently. Audit the other 9 files — decide whether each is finished, half-finished, or should be reverted.

### 3. `wip(youtube): popout native input area when pickers open` (commit `809d7b4`)
Self-declared incomplete. Either finish, squash into a follow-up complete commit, or revert before release.

### 4. Manifest version not bumped
`manifest.json` still says `1.6.1`. Pick the next version and bump it (also `package.json` if it tracks separately).

---

## Soft blockers (should fix, can be argued)

### 5. Playwright tests not run
107 tests across 18 files defined; never executed against the current branch state. Some are new (tab bar, widget zones). Run the full suite, triage failures.
```bash
npm run test
```

### 6. Scroll-indicator fix has no automated test
Today's fix is verified by manual browser scenarios (auto-follow burst, scroll-up + count, click-to-clear). Add a Playwright test that exercises the same three scenarios so it doesn't regress.

### 7. Open debug notes (untracked)
Triage these four — figure out which are addressed by recent commits and which aren't:
- `.planning/debug/422-unlisted-youtube-stream.md`
- `.planning/debug/duplicate-message-on-send.md`
- `.planning/debug/userflair-not-honored.md`
- `.planning/debug/ws-404-priest-qt.md`

### 8. 68-commit diff is a lot to ship at once
Substantial features: Twitch viewer card overlay, native-session sending, YouTube Studio integration, many YouTube widget-detection fixes. If anything regresses post-release, bisect surface is huge. Consider whether this should be split into two releases or whether release notes alone suffice.

---

## Cleanup

### 9. Untracked artifacts at repo root
~50 `*.jpg`/`*.png` screenshots, `snapshot.md`, `.claude/`, etc. These shouldn't ship.
- Add `*.jpg`, `*.png` (root only), `snapshot.md`, `.claude/` to `.gitignore` (or move to a `.gitignored` debug folder)
- Delete what's no longer needed

---

## Resume here tomorrow

Suggested order:
1. Commit scroll-indicator fix in isolation (today's work)
2. Fix the 6 type errors (each is a small, local change)
3. Audit + decide on the other 9 modified files in working tree
4. Resolve `wip(youtube)` commit
5. Run Playwright suite, triage
6. Triage `.planning/debug/*.md`
7. `.gitignore` cleanup
8. Bump manifest version
9. Tag release
