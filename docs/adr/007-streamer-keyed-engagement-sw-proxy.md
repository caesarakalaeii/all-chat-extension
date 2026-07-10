# ADR 007: Streamer-Keyed Engagement via a Service-Worker Proxy

**Status: Accepted**
**Date: 2026-07-07**

## Context

All-Chat gained cross-platform polls, predictions, and viewer points (the engagement
feature — backend issue #523 / PR #524, backend ADR-0031). The extension needs to render a
streamer's live round inside the chat overlay and let a signed-in viewer vote or wager.

Two constraints shaped the design:

1. **The overlay id is a secret bearer capability.** In the backend model an engagement
   round is addressed by the streamer's private *overlay id*; anyone holding it can read the
   round. The extension runs in an untrusted page context (an in-page iframe on
   twitch.tv/youtube.com/kick.com, plus a pop-out window), so the overlay id must never reach
   a page or content-script context. Backend ADR-0031 introduced streamer-*username*-keyed
   engagement endpoints (`/api/v1/engagement/streamers/{username}/{active,me,vote,wager,heartbeat}`)
   precisely so viewer clients never learn the overlay id.
2. **Only the service worker holds the viewer JWT.** The extension already centralizes the
   viewer session (the JWT and `/auth/viewer/*` calls) in the MV3 service worker; page
   contexts never see the raw token. Engagement's authenticated calls (`me`/`vote`/`wager`/
   `heartbeat`) must reuse that, and gateway `OriginCheck` treats a background fetch (which
   sends no `Origin`) as allowed, so issuing them from the SW also sidesteps CORS.

The extension has its own ADR mechanism (005, 006), but the engagement decision had until now
only been recorded as *backend* ADR-0031 in a different repository, leaving the extension-side
architecture undocumented (review finding: PR #89, item 10).

## Decision

Record the extension-side engagement architecture as follows.

1. **Everything is keyed by streamer username; the overlay id is never on the wire.** The
   extension only ever calls the streamer-keyed endpoints. There is a test guard
   (`ENG-03`) asserting no source file references an `engagement/overlays/…` route.

2. **The service worker is the sole API proxy.** Five message types
   (`ENGAGEMENT_ACTIVE`, `ENGAGEMENT_ME`, `ENGAGEMENT_VOTE`, `ENGAGEMENT_WAGER`,
   `ENGAGEMENT_HEARTBEAT`) are handled in the SW via a shared `engagementFetch` helper that
   resolves the gateway base URL, attaches the viewer JWT (through `ensureValidToken`, so an
   expired session is cleared rather than sent), and parses the JSON body. Page contexts talk
   to the SW only, through the thin `src/lib/engagementClient.ts` wrapper over
   `chrome.runtime.sendMessage`. The overlay id and the raw JWT stay inside the SW.

3. **WS frames are a refetch signal, not a state source.** The gateway fans
   `poll_update` / `prediction_update` frames onto the same overlay chat socket the extension
   already uses. `useEngagement` treats them purely as "something changed, refetch now" (a
   debounced `refresh()`), mirroring the frontend's `useEngagementLive`. Authoritative state
   always comes from the HTTP endpoints (which apply the All-Chat-over-native display
   precedence). A live round also gets a slow (15 s) fallback poll so a dropped frame and
   off-band point changes still reconcile; when nothing is live there is no polling.

4. **Transient vs. definitive is explicit.** `fetchActive` returns `undefined` on a transient
   failure (SW asleep / 5xx) so the last render is kept, and `null` on a definitive "no round"
   (200 with no round, or a 404 because the overlay went private) so the panel clears.
   `refresh()` uses a monotonic request-sequence guard, and `vote`/`wager` advance it, so a
   stale in-flight response can never revert a fresher vote.

5. **Currency isolation for mirrored Twitch-native rounds.** A round with
   `source === 'twitch_native'` renders read-only in both the panel (the vote/wager gate) and
   the hook (`vote`/`wager` bail before the network), so an All-Chat action can never target a
   native round (backend ADR-0029/0030). Guarded by `ENG-06` and the jsdom component tests.

6. **Session-recovery via `storage.onChanged`.** The SW clears `viewer_jwt_token` from storage
   on expiry or a server-side rejection (a 401 on `/me`). The overlay listens for that removal
   and flips `authed` false so the panel offers re-login. A *deliberate* logout writes a
   short-lived `viewer_logout_intent` marker first, so the recovery path stays silent instead
   of raising the "Session expired" toast reserved for genuine expiry.

## Consequences

- The overlay-id secret and the viewer JWT never leave the service worker; the extension is a
  pure username-keyed client. This is the property backend ADR-0031 exists to enable, now
  documented and test-guarded on the extension side.
- Engagement state is eventually consistent with a small, bounded staleness (WS debounce +
  15 s fallback) rather than a live subscription — acceptable for tally display and simpler
  than a second stateful socket.
- Adding an engagement action means adding one SW message type + one `engagementClient`
  wrapper; the page never gains network or token access.
- Behavior that CI cannot exercise end-to-end (a live round needs a running
  engagement-service) is instead unit-tested with jsdom + @testing-library/react
  (`npm run test:unit`); the Playwright suite keeps lightweight source-level regression guards
  (`ENG-01…09`).

## Alternatives Considered

### Call the engagement endpoints directly from the page/iframe
Pros: no SW round-trip. Cons: the viewer JWT would have to live in a page context, and the
fetch would carry an `Origin` header subject to CORS. Rejected — it breaks the "only the SW
holds the token" invariant and the no-Origin OriginCheck path.

### Drive the panel purely from WS frames (no HTTP refetch)
Pros: no polling. Cons: the frames don't carry the per-viewer snapshot (balance, this viewer's
vote/wager) and a dropped frame would desync the tallies with no self-heal. Rejected in favor
of frames-as-signal + authoritative HTTP, matching the frontend.

### Expose the overlay id to the extension and use the overlay-keyed endpoints
Pros: fewer backend endpoints. Cons: leaks the secret bearer capability into an untrusted page
context. Rejected — this is the exact threat backend ADR-0031 is designed to prevent.
