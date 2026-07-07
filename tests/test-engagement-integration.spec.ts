import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Static source-checks for the engagement integration (all-chat PR #524 / backend ADR-0031):
 * polls, predictions, and viewer points inside the extension chat overlay.
 *
 * A live end-to-end (an actual poll appearing + a vote landing) requires a running
 * engagement-service and a streamer with a public overlay running a round, which is not
 * reproducible in CI — so these guard the wiring and, critically, the invariant that the
 * extension participates by streamer *username* and never handles an overlay id
 * (the viewer-withheld bearer capability). Same file-reading style as test-design-system.
 *
 * Behavior (the hook/panel logic — optimistic rollback, request sequencing, the native
 * read-only gate, allow_change locking, the wager-rejection copy) is exercised for real by
 * the jsdom unit suite in tests/unit/*.test.ts (`npm run test:unit`). The checks here are
 * regression guardrails for the pieces that unit tests can't reach cheaply: the service
 * worker's message switch and the ChatContainer auth wiring.
 */

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test.describe('Engagement integration (PR #524 / backend ADR-0031)', () => {
  test('ENG-01: engagement types exist (Poll, Prediction, StreamerActive, snapshots)', () => {
    const t = read('src/lib/types/engagement.ts');
    for (const sym of ['interface Poll', 'interface Prediction', 'interface StreamerActive', 'interface ViewerEngagement', 'PollSnapshot', 'PredictionSnapshot']) {
      expect(t, `missing ${sym}`).toContain(sym);
    }
  });

  test('ENG-02: service worker proxies the streamer-keyed endpoints for every engagement action', () => {
    const sw = read('src/background/service-worker.ts');
    for (const msg of ['ENGAGEMENT_ACTIVE', 'ENGAGEMENT_ME', 'ENGAGEMENT_VOTE', 'ENGAGEMENT_WAGER', 'ENGAGEMENT_HEARTBEAT']) {
      expect(sw, `SW does not handle ${msg}`).toContain(`case '${msg}'`);
    }
    // The SW is the API proxy; it must call the streamer-keyed base and attach the JWT.
    expect(sw).toContain('/api/v1/engagement/streamers/');
    expect(sw).toContain('ensureValidToken()');
  });

  test('ENG-03: overlay-id secrecy — the extension never builds an overlay-keyed engagement URL', () => {
    // backend ADR-0031: viewers must not learn the overlay id. Any /engagement/overlays/... call
    // from the extension would mean an overlay id crossed into a page/background context.
    for (const f of [
      'src/background/service-worker.ts',
      'src/lib/engagementClient.ts',
      'src/ui/hooks/useEngagement.ts',
      'src/ui/components/EngagementPanel.tsx',
    ]) {
      expect(read(f), `${f} references an overlay-keyed engagement route`).not.toContain('engagement/overlays/');
    }
  });

  test('ENG-04: the client talks to the service worker via chrome.runtime.sendMessage', () => {
    const c = read('src/lib/engagementClient.ts');
    expect(c).toContain('chrome.runtime.sendMessage');
    for (const fn of ['fetchActive', 'fetchMe', 'export async function vote', 'export async function wager', 'export async function heartbeat']) {
      expect(c, `client missing ${fn}`).toContain(fn);
    }
  });

  test('ENG-05: ChatContainer handles poll_update / prediction_update frames and mounts the panel', () => {
    const cc = read('src/ui/components/ChatContainer.tsx');
    expect(cc).toContain("wsMessage.type === 'poll_update'");
    expect(cc).toContain("wsMessage.type === 'prediction_update'");
    expect(cc).toContain('<EngagementPanel');
    expect(cc).toContain('useEngagement(');
  });

  test('ENG-06: mirrored Twitch-native rounds render read-only (no vote/wager)', () => {
    // Currency isolation (ADR-0029/0030): the panel and hook must gate participation on
    // source !== twitch_native so an All-Chat vote/wager can never target a native round.
    // Behavior is proven in tests/unit/engagementPanel.test.tsx; this guards against the
    // specific regression of dropping `!isNative` from the gate while leaving the literal —
    // which defeated the old contains-only check — by asserting it inside canVote/canWager.
    const panel = read('src/ui/components/EngagementPanel.tsx');
    const hook = read('src/ui/hooks/useEngagement.ts');
    expect(panel).toMatch(/const canVote = [^;]*!isNative/);
    expect(panel).toMatch(/const canWager = [^;]*!isNative/);
    // Hook belt-and-braces: vote()/wager() bail on a native round before hitting the network.
    expect(hook).toContain("poll.source === 'twitch_native'");
    expect(hook).toContain("prediction.source === 'twitch_native'");
  });

  test('ENG-08: a server 401 on /me drops the token so the UI re-prompts (item 8)', () => {
    // A locally-valid but server-rejected token (revoked/rotated/ban) must not leave a stale
    // authed UI whose every vote/wager 401s. The ENGAGEMENT_ME handler clears auth on 401.
    const sw = read('src/background/service-worker.ts');
    const meCase = sw.slice(sw.indexOf("case 'ENGAGEMENT_ME'"), sw.indexOf("case 'ENGAGEMENT_VOTE'"));
    expect(meCase).toMatch(/res\.status === 401/);
    expect(meCase).toContain('clearViewerAuth()');
  });

  test('ENG-09: deliberate logout is marked so recovery stays silent (item 2)', () => {
    // A deliberate "Sign out" must not raise the "Session expired" toast reserved for a real
    // expiry. Both logout paths mark intent; the ChatContainer recovery listener consumes it.
    const sw = read('src/background/service-worker.ts');
    const cc = read('src/ui/components/ChatContainer.tsx');
    // SW popup-logout path marks intent before clearing.
    expect(sw).toContain('markIntentionalLogout()');
    // Overlay recovery peeks the marker (non-destructive, so multiple contexts stay silent)
    // instead of always toasting.
    expect(cc).toContain('wasIntentionalLogout()');
    expect(cc).toContain('markIntentionalLogout()');
  });

  test('ENG-07: version bumped past 1.6.x and manifest/package agree', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const manifest = JSON.parse(read('manifest.json')) as { version: string };
    expect(pkg.version).toBe(manifest.version);
    expect(pkg.version, 'expected a feature bump above 1.6.x').not.toMatch(/^1\.6\./);
  });
});
