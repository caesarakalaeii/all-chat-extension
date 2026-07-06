import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Static source-checks for the engagement integration (all-chat PR #524 / ADR-0031):
 * polls, predictions, and viewer points inside the extension chat overlay.
 *
 * A live end-to-end (an actual poll appearing + a vote landing) requires a running
 * engagement-service and a streamer with a public overlay running a round, which is not
 * reproducible in CI — so these guard the wiring and, critically, the invariant that the
 * extension participates by streamer *username* and never handles an overlay id
 * (the viewer-withheld bearer capability). Same file-reading style as test-design-system.
 */

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test.describe('Engagement integration (PR #524 / ADR-0031)', () => {
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
    // ADR-0031: viewers must not learn the overlay id. Any /engagement/overlays/... call
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
    const panel = read('src/ui/components/EngagementPanel.tsx');
    const hook = read('src/ui/hooks/useEngagement.ts');
    expect(panel).toContain("'twitch_native'");
    expect(hook).toContain("=== 'twitch_native'");
  });

  test('ENG-07: version bumped past 1.6.x and manifest/package agree', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const manifest = JSON.parse(read('manifest.json')) as { version: string };
    expect(pkg.version).toBe(manifest.version);
    expect(pkg.version, 'expected a feature bump above 1.6.x').not.toMatch(/^1\.6\./);
  });
});
