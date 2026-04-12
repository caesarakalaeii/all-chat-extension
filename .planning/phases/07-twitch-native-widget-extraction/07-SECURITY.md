---
phase: 07-twitch-native-widget-extraction
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
completed: 2026-04-12
threats_total: 7
threats_closed: 7
threats_open: 0
---

# Phase 07 Security Audit

**Phase:** 07 — Twitch Native Widget Extraction
**ASVS Level:** 1
**Result:** SECURED — 7/7 threats closed

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-07-01 | I — Information Disclosure | accept | CLOSED | twitch-mock.html is a Playwright test fixture; not listed in webpack entry points; no sensitive data in fixture content (community-points mock data is synthetic) |
| T-07-02 | T — Tampering | accept | CLOSED | Tab bar DOM is injected into Twitch page context — identical trust level to all existing AllChat DOM injection; Twitch page can already modify any injected element; threat accepted by design |
| T-07-03 | S — Spoofing | mitigate | CLOSED | `extensionOrigin` used as `targetOrigin` when posting `TAB_BAR_MODE` to iframe: `twitch.ts:738-739` — `iframe.contentWindow?.postMessage({ type: 'TAB_BAR_MODE', enabled: true }, extensionOrigin)` |
| T-07-04 | S — Spoofing | accept | CLOSED | `event.source !== window.parent` guard present in ChatContainer message handler at `ChatContainer.tsx:346`; only the direct parent frame (content script relay) can deliver TAB_BAR_MODE |
| T-07-05 | T — Tampering | accept | CLOSED | Cloned nodes originate from Twitch's own React-managed DOM; no user-controlled string is inserted as innerHTML; same trust boundary as all existing extension DOM injection |
| T-07-06 | D — Denial of Service | mitigate | CLOSED | Widget detection MutationObserver scoped to chatShell with `{ childList: true, subtree: false }` at `twitch.ts:319`; secondary observation on `.stream-chat` only (not `.chat-shell` subtree); clone sync observers targeted on individual widget nodes only |
| T-07-07 | E — Elevation of Privilege | accept | CLOSED | `dispatchEvent` and `.click()` execute Twitch's own React event handlers on Twitch-owned DOM elements; content script already has full page access via `host_permissions`; no new capability granted |

---

## Accepted Risks Log

| Threat ID | Risk | Rationale | Owner |
|-----------|------|-----------|-------|
| T-07-01 | Test fixture HTML with mock Twitch widget selectors | File is test-only (`tests/fixtures/`), excluded from webpack bundle via `entry` configuration; contains no credentials, tokens, or real user data | phase-07 |
| T-07-02 | Tab bar DOM tamperable by Twitch page scripts | AllChat has always injected DOM into the Twitch page context; Twitch controls the host page and can modify any injected element — this is the accepted extension injection threat model | phase-07 |
| T-07-04 | TAB_BAR_MODE spoofable if parent-frame guard bypassed | `event.source === window.parent` check limits delivery to the direct parent frame; no cross-origin escalation possible from this message type (sets UI boolean only) | phase-07 |
| T-07-05 | Cloned widget DOM may reflect Twitch content changes | Clones are derived from Twitch's own DOM via `cloneNode(true)`; no user input is interpolated as HTML; trust level is identical to reading `document.querySelector` results | phase-07 |
| T-07-07 | `dispatchEvent` executes Twitch React handlers | Content script has `host_permissions` on `twitch.tv`; executing Twitch's own handlers is within the declared permission scope; no browser privilege boundary crossed | phase-07 |

---

## Unregistered Threat Flags

None. All SUMMARY.md `## Threat Flags` sections across plans 07-01 through 07-05 explicitly report no new threat surface. No unregistered flags to log.

---

## Mitigation Evidence Detail

### T-07-03 — TAB_BAR_MODE targetOrigin (twitch.ts)

```
twitch.ts:735-740
protected onIframeCreated(iframe: HTMLIFrameElement): void {
  iframe.addEventListener('load', () => {
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);
    // T-07-03: use extensionOrigin as targetOrigin (not '*') when sending TAB_BAR_MODE
    iframe.contentWindow?.postMessage({ type: 'TAB_BAR_MODE', enabled: true }, extensionOrigin);
  });
}
```

Pattern matches declared mitigation: `extensionOrigin as targetOrigin when sending TAB_BAR_MODE`.

### T-07-06 — MutationObserver scoping (twitch.ts)

```
twitch.ts:319
widgetObserver.observe(chatShell, { childList: true, subtree: false });

twitch.ts:322-325
const chatContent = chatShell.querySelector('.stream-chat') || chatShell;
if (chatContent !== chatShell) {
  widgetObserver.observe(chatContent, { childList: true, subtree: true });
}
```

Pattern matches declared mitigation: observer scoped to `chatShell` direct children with `subtree: false`; secondary observation limited to `.stream-chat` subtree only. Avoids `subtree: true` on entire `.chat-shell` (Pitfall 5).

Clone sync observers: each targets a specific widget `original` node (`twitch.ts:205-210`) — not a broad container.
