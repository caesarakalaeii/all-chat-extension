---
name: PR #89 engagement — adversarial review & improvement plan
description: Findings and prioritized fix plan from an adversarial review of PR #89 (live polls/predictions & viewer points in the chat overlay), verified against the all-chat backend companion (PR #524 / ADR-0031)
type: review-plan
date: 2026-07-07
pr: https://github.com/caesarakalaeii/all-chat-extension/pull/89
branch: feat/engagement-polls-predictions
head: 04031dc
---

# PR #89 — Adversarial Review & Improvement Plan

> **STATUS (2026-07-07): all 11 findings fixed + P4 test harness added + P5 ADR/docs done.**
> Extension: items 1–8, 10, 11 implemented (uncommitted on `feat/engagement-polls-predictions`).
> Backend: item 9 landed in all-chat commit `c64145b8`. A follow-up adversarial review of the
> fixes surfaced 5 more defects in the new code (multi-context logout-toast race, chat-send-401
> double toast, `requestLogin` timer leak + abandon-lockout, a weak sequencing test) — all fixed.
> Added a vitest+jsdom unit harness (`npm run test:unit`, 26 tests). Still open (ops, not code):
> the CORS_ORIGIN allowlist check and a manual live e2e.

Review of PR #89 *"live polls/predictions & viewer points in the chat overlay"*
(1049 additions, 11 files) against `origin/main`, cross-checked against the
all-chat backend companion on `feature/523-engagement-polls-predictions-points`
(PR #524 / ADR-0031).

## Method

Seven adversarial finder passes (contract-integration, hook-logic, panel-wiring,
service-worker, security-privacy, test-coverage, docs-adr-version), each finding
then challenged by two independent verifier lenses ("prove it reproduces" and
"refute it / already handled"). 19 findings raised; 1 rejected 2/2 as unreachable,
1 was a duplicate. **13 distinct confirmed issues** remain — all
robustness/UX/test/docs, none architectural. Nothing is High severity.

Severities below are shown as `finder → verifier-adjusted` where they differ.

## Verified solid (no change needed)

- **Overlay-id secrecy holds end-to-end** (ADR-0031). The security/privacy pass
  returned zero findings: the overlay id never reaches a page/background context,
  the extension keys everything by streamer username, and the SW is the only holder
  of the JWT.
- **No XSS.** `poll.question`, option/outcome `label`, `prediction.title`,
  `points_name` are all rendered as escaped React text; the only inline style is a
  clamped `width: ${p}%` numeric.
- **JWT hygiene.** Token travels only in the `Authorization` header; never logged.
- **Cross-repo contract matches** (verified directly against the backend):
  endpoints, request/response shapes, the wager `reason` string set
  (`not_found|not_active|bad_outcome|already_wagered|insufficient|native`),
  `ViewerEngagement` JSON tags, gateway route registration (active in `publicAPI`;
  me/vote/wager/heartbeat in `protectedAPI`), the `poll_update`/`prediction_update`
  WS-frame emission on the viewer chat socket, and the OriginCheck "no Origin header
  → allowed" path.

## Considered and dismissed

- **Vote-error rollback wiping a real vote** (`useEngagement.ts:169`) — rejected 2/2.
  `chosen` is resolved from an idx drawn from the same `poll.options` the panel
  renders and `vote` is memoized on `poll`, so the DOM handler and the closure come
  from the same commit; `chosen` is never falsy on the only call path, so
  `prevVotedId` is always genuinely captured. Not reachable. (Optional: gate the
  rollback behind `if (chosen)` purely to make intent explicit — no behavior change.)

---

## P1 — Correctness & user-facing (fix before merge)

### [ ] 1. `refresh()` has no request sequencing — a stale response reverts a fresh vote
`medium` · `src/ui/hooks/useEngagement.ts:95`

`refresh()` fires from four uncoordinated sources (initial effect, the 15s
`ACTIVE_POLL_MS` interval, the WS-frame debounce, and post-vote/wager). The only
guard is `aliveRef`, which flips on unmount. Confirmed race: the interval issues a
pre-vote fetch; the viewer votes; `vote()` writes fresh tallies + fires a
reconciling refresh; the *earlier* pre-vote response then lands last and
`setPoll`/`setEngagement` (L106-112) overwrite the vote and clear its highlight.
Normally self-heals on the reconciling refresh, but if that one hits the SW-asleep/5xx
transient the code is written to tolerate, the stale state persists to the next tick.

**Fix:** capture a monotonic `seqRef` before each `refresh()` await; on resolution,
bail if `seqRef.current !== mySeq` (or use a per-refresh `AbortController`). Apply the
same high-water check to the `vote`/`wager` `.then()` writes (L187, L216-218) so an
in-flight earlier refresh cannot overtake the action's own writes.

### [ ] 2. Intentional logout raises a misleading "Session expired" toast
`medium → low` · `src/ui/components/ChatContainer.tsx:664`

The new `storage.onChanged` recovery listener calls `handleAuthError()` on *any*
`viewer_jwt_token` removal while the captured `viewerToken` is still truthy — and
`handleAuthError` unconditionally toasts *"Session expired. Please log in again."*
(L655). Deterministic repro: a signed-in viewer watching a stream clicks **Sign out
in the popup** → the SW `clearViewerAuth()` fires `onChanged` in the still-mounted
overlay context → a red "Session expired" warning after a *deliberate* logout. The
state recovery itself is correct; only the copy is wrong. (`chrome.storage.onChanged`
fires in every extension context, so an in-overlay ref flag can't suppress it.)

**Fix:** make the recovery-from-`onChanged` path flip to logged-out **silently**
(or "Signed out."). Reserve the "Session expired" copy for paths that actually detect
expiry (the SW's `ensureValidToken` clearing on 401), or gate it behind an
intentional-logout marker written to storage.

### [ ] 3. `poll.allow_change` is never consulted — re-vote silently reverts, no feedback
`medium → low` · `src/ui/components/EngagementPanel.tsx:160`

`canVote = authed && !isNative && !isClosed` ignores both `poll.allow_change` (the
type field exists) and whether the viewer already voted. On an `allow_change:false`
poll the backend `RecordVote` does `ON CONFLICT DO NOTHING` but still returns
`accepted=true` → HTTP 200, no error. So a second click optimistically moves the ✓,
the backend no-ops, then the `/me` refetch snaps the ✓ back — a guaranteed no-op
flicker with no explanation. The prediction path already guards the analogous case
(`!alreadyWagered` + "locked in" hint at L330-332); polls omit it.

**Fix:** in `PollBlock`, when `authed && engagement?.voted_option_id &&
poll.allow_change === false`, set `canVote=false` (lock non-chosen options) and show
a "You've locked in your vote" hint mirroring the prediction block. Keep options
clickable when `allow_change` is true.

---

## P2 — Edge cases & polish

### [ ] 4. Login / token-expiry blanks the still-public live round
`low` · `src/ui/hooks/useEngagement.ts:119`

The init effect depends on `[refresh, authed]` and unconditionally does
`setPoll(null); setPrediction(null); setEngagement(null)` on every auth toggle — but
`poll`/`prediction` are the *public* aggregate and don't depend on auth. The panel
unmounts (L76 returns null) then flickers back after the refetch; if that immediate
refetch flaps, the round stays blank until the next WS frame.

**Fix:** split into two effects — one keyed on `streamer` that clears+refetches the
round, one keyed on `authed` that only refreshes the viewer snapshot without
pre-clearing the public round.

### [ ] 5. Vote `{status:"ok"}` fallback is cast to `Poll` and blanks the poll
`low` · `src/ui/hooks/useEngagement.ts:187` (+ `src/lib/engagementClient.ts:66`)

When the backend accepts a vote but its follow-up `GetPoll` fails, it returns
`200 {status:"ok"}`. `engagementClient.vote` does `res.data as Poll` unchecked, then
`if (res.poll) setPoll(res.poll)` stores an object with no `state`/`options` →
`showPoll` goes false → the poll block vanishes until the trailing `refresh()`
reconciles. No crash, but a visible flicker right after a successful vote.

**Fix (one line):** guard the hook — `if (res.poll?.id) setPoll(res.poll)` — so the
sentinel just falls through to `refresh()`.

### [ ] 6. CANCELED prediction gives the viewer no refund/cancel feedback
`medium → low` · `src/ui/components/EngagementPanel.tsx:74`

`GetActiveDisplayPrediction` serves a CANCELED prediction for the 20s grace window,
but `showPrediction` only accepts ACTIVE/LOCKED/RESOLVED — so a viewer who staked
points sees the panel simply vanish (balance refunded server-side, silently). It also
keeps `roundActive` true, so the 15s interval polls an invisible panel (minor).

**Fix:** add a CANCELED branch rendering a brief "Prediction canceled — wager
refunded" reveal during the grace window, mirroring the RESOLVED state.

### [ ] 7. `requestLogin` accumulates a `message` listener per click
`medium → low` · `src/ui/components/ChatContainer.tsx:683`

No re-entry guard, and the "Sign in to take part" button is never disabled. An
impatient double-click registers two `window` listeners; when `LOGIN_SUCCESS`
arrives, `handleLogin` runs twice → two `/auth/viewer/me` fetches and two "Logged in
as X" toasts. Writes are idempotent and it reuses one OAuth popup, so no corruption —
just redundant calls + a duplicate toast.

**Fix:** an in-flight ref that early-returns while a login is pending (cleared on
success/error/timeout) + disable the button while pending.

### [ ] 8. `/me` 401 leaves stale "authed" UI that never reconciles
`low` · `src/background/service-worker.ts:377`

`ENGAGEMENT_ME` collapses *every* non-OK response (including a server 401) to
`data:null`. `ensureValidToken` only clears on *local* expiry, so a token still valid
locally but rejected server-side (key rotation, revocation, ban) yields a stale
balance + vote highlight while every vote/wager 401s with only the generic
"Vote failed."

**Fix:** in `ENGAGEMENT_ME`, on `status===401` call `clearViewerAuth()` (triggering
the existing `storage.onChanged` recovery → re-login prompt); keep `data:null`
(preserve) only for 5xx/transport — mirroring the ACTIVE handler's
transient-vs-definitive split. Key the branch off the `engagementFetch` result
status, not the `getViewerToken()` pre-check.

---

## P3 — Backend dependency (all-chat repo, ship with the companion PR)

### [ ] 9. `/me` excludes the grace-window states `/active` still displays
`medium → low` · `all-chat/services/engagement-service/handler/streamer.go:126-135`

`/active` uses the display queries (20s grace after CLOSED/RESOLVED); `/me` uses
`GetActivePoll`/`GetActivePrediction` (ACTIVE/LOCKED only). During the ~20s result
reveal the round is still on screen, but `/me` returns no
`voted_option_id`/`wager_outcome_id`/`wager_amount` → the viewer's own ✓ / "· your
wager 500" marker disappears at the exact moment the winner is revealed. (The Winner
badge survives — it comes from `/active`. No data loss; the wager is still recorded.)
Not fixable in the extension, which is never handed the round id.

**Fix (backend):** have `StreamerEngagement` resolve the viewer's entry against the
same round `/active` displays (use `GetActiveDisplayPoll/Prediction`, or look up the
entry by the displayed round id). Not blocking on the extension.

---

## P4 — Test coverage (the suite is 100% static grep → false confidence)

`ENG-01..07` only assert that strings exist in source files; they exercise no
behavior. **ENG-06's currency-isolation guard is defeatable**: dropping `!isNative`
from `canVote`/`canWager` (and the hook guard) while leaving the `isNative`
computation keeps the `'twitch_native'` literal present, so the test stays green while
an All-Chat vote could fire at a mirrored native round — the exact ADR-0029/0030
invariant it claims to protect. The PR's own advertised fixes (optimistic rollback,
`fetchActive` tri-state, transient-vs-definitive clearing) have zero executing tests,
and these are pure/mockable — the "not reproducible in CI" caveat applies only to
full e2e, not to unit-testing the hook with a stubbed `engagementClient`.

**Decision needed:** the repo has **no unit/hook harness** (only Playwright).
Recommended: add **jsdom + @testing-library/react** (smallest lift) and write:

- [ ] Component: `PollBlock`/`PredictionBlock` with `source:'twitch_native'` → options
  `disabled`, `onVote`/`onWager` never called; `source:'allchat'` ACTIVE → opposite.
  *(replaces the defeatable ENG-06)*
- [ ] `fetchActive` tri-state: `{success:false}`→`undefined`,
  `{success:true,data:null}`→`null`, object→object.
- [ ] `wagerRejectionCopy` table (export the fn): each reason → its copy;
  `insufficient` interpolates `pointsName`+`balance`; unknown → fallback.
- [ ] Optimistic-vote rollback: a failed `vote()` restores the prior `voted_option_id`.
- [ ] `refresh()` transient-vs-definitive: `undefined` keeps the round, `null` clears it.

*(Minimum without a harness: strengthen ENG-06 to grep for `!isNative` inside the
`canVote`/`canWager` expressions — weaker, but catches the specific regression.)*

Contested items (1 confirm / 1 reject) folded into the above as low-value-but-cheap:
`wager()` reason extraction and `wagerRejectionCopy` mapping are correct today and
fail safe via the `default` branch; worth a test only once a harness exists.

---

## P5 — Docs / ADR (per standing convention: architectural changes need an ADR)

### [ ] 10. No extension-side ADR for the SW-proxy engagement architecture
`medium → low` · `docs/adr/`

The extension repo has an ADR mechanism (005, 006 record *smaller* decisions), but
this PR's architectural addition — the SW message-proxy layer (`engagementFetch` + 5
handlers), the `engagementClient` module, the message-union additions, and the
WS-frame-as-refetch-signal pattern — is documented only as **backend** ADR-0031 in a
different repo.

**Fix:** add `docs/adr/007-streamer-keyed-engagement-sw-proxy.md` recording the
extension-side decisions (username-keyed, overlay-id never on the wire, WS-frame
refetch signal, token-recovery via `storage.onChanged`, optimistic rollback),
cross-linking backend ADR-0031.

### [ ] 11. Dangling "ADR-0031" references in 9 source locations
`nit` · e.g. `src/background/service-worker.ts:349`

Comments cite `ADR-0031`, which doesn't exist in this repo's `docs/adr/` (only
005/006). They're paired with "PR #524" so intent is clear, but the citation doesn't
resolve locally.

**Fix:** qualify as "backend ADR-0031" (or point at the new local ADR-007 once
created).

---

## Pre-merge verification (not code changes)

- [ ] **Deployment:** confirm `CORS_ORIGIN` (caesar-deployment) allowlists the
  extension origin (`chrome-extension://*` / `moz-extension://*`). The no-Origin
  OriginCheck path works *if* the MV3 service worker truly sends no `Origin` on the
  POST fetches; if Chrome attaches `Origin: chrome-extension://<id>`, the allowlist
  entry is the fallback that keeps vote/wager/heartbeat from 403ing. One-time runtime
  check against a production build.
- [ ] **Manual e2e:** a real round appearing + a vote/wager landing against a running
  engagement-service (CI can't cover it, as the PR notes).

## Suggested sequencing

1. **P1** (items 1-3) + items **5** and **7** — quick, high-value, low-risk; do together.
2. **P4** — harness + tests (the larger lift; would have caught several of these).
3. **P3** — rides with the backend PR.
4. **P5** — satisfies the ADR convention.
