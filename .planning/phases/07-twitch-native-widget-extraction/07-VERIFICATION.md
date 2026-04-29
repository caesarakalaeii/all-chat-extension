---
phase: 07-twitch-native-widget-extraction
verified: 2026-04-12T21:00:00Z
status: human_needed
score: 4/5 roadmap success criteria verifiable; SC-1/SC-2/SC-5 require human (live Twitch)
overrides_applied: 0
human_verification:
  - test: "Load built extension on a live Twitch stream (logged in). Verify channel points balance and claim button are visible below the AllChat iframe while AllChat tab is active. Click the claim button and confirm points update."
    expected: "Channel points widget appears in bottom zone; clicking it triggers real Twitch action (balance updates)"
    why_human: "Widget selectors (community-points-summary) are LOW confidence from 2026-04 — can only confirm against live Twitch DOM. Graceful degradation means the extension runs without error even if selectors have rotted."
  - test: "With a streamer running an active prediction or poll, verify the prediction/poll card appears in the top widget zone while AllChat is active. Try voting and confirm the vote registers."
    expected: "Prediction/poll clone appears in top zone; clicking it dispatches the real Twitch vote action"
    why_human: "Transient widget detection depends on live Twitch DOM events (MutationObserver firing on chatShell children). Cannot replicate with mock fixture."
  - test: "Click Twitch Chat tab, then AllChat tab. Verify no state loss in either direction (AllChat messages still present, native Twitch chat state preserved). Verify the tab bar stays visible at all times."
    expected: "Instant tab switching with no reload, no blank state, tab bar always present"
    why_human: "State preservation across view switches depends on live iframe and Twitch chat behavior — not reproducible in offline fixture tests."
  - test: "Load YouTube and Kick stream pages with the extension active. Verify full header appears (InfinityLogo, connection dot, switch-to-native button). Verify no tab bar appears on these platforms."
    expected: "YouTube and Kick show the pre-Phase-7 header unchanged; no regressions"
    why_human: "Platform isolation depends on live page context; the conditional guard (tabBarMode defaults false, TAB_BAR_MODE only sent by Twitch content script) is code-verified but runtime behavior needs human confirmation"
  - test: "On Twitch in-page view, click the floating pop-out button (top-right of iframe). Verify the pop-out window opens with the full header (not tabBarMode). Close pop-out and confirm in-page chat returns."
    expected: "Pop-out renders full ChatContainer header; closing pop-out restores in-page Twitch chat without regression"
    why_human: "Pop-out window lifecycle (open, restore, cross-window messaging) cannot be tested without a live browser session"
---

# Phase 7: Twitch Native Widget Extraction — Verification Report

**Phase Goal:** Twitch-native interactive features (channel points, predictions, polls, raids) remain fully accessible when AllChat is active — widgets are extracted from the native chat DOM and repositioned alongside the AllChat iframe, with a tab bar switcher for instant toggling between AllChat and native chat views
**Verified:** 2026-04-12T21:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Channel points balance, claim button, and redemption menu are visible and functional while AllChat is the active chat view | ? HUMAN NEEDED | Widget extraction code exists and is wired (cloneWidgetIntoZone, WIDGET_SELECTORS with community-points-summary selector). Cannot confirm selectors resolve against live Twitch DOM. |
| SC-2 | Predictions and polls UI is accessible without switching to native chat | ? HUMAN NEEDED | Transient widget detection via MutationObserver implemented. Prediction selector (community-prediction-highlight-header) is LOW confidence — requires live Twitch verification. |
| SC-3 | A persistent tab bar ([AllChat] | [Twitch Chat]) replaces the current small "switch to native" button — switching is instant with no state loss in either view | ? HUMAN NEEDED | Tab bar DOM creation verified in twitch.ts (allchat-tab-bar, allchat-tab-allchat, allchat-tab-twitch). switchToTwitchTab/switchToAllChatTab wired. Cannot verify "no state loss" without live browser. |
| SC-4 | Native chat stays mounted (hidden) when AllChat tab is active — no reload on switch | ✓ VERIFIED | switchToAllChatTab hides #allchat-container and calls hideNativeChat() via this.showNativeChat/hideNativeChat. Native chat is hidden via #allchat-hide-native-style, not removed. PlatformDetector guards confirmed. Build exits 0. |
| SC-5 | The approach generalizes to YouTube and Kick native features in future phases | ? HUMAN NEEDED | PlatformDetector.handleSwitchToNative guard (`!document.getElementById('allchat-tab-bar')`) makes button injection platform-agnostic. No later phases exist to defer this to — requires human regression check on YouTube/Kick. |

**Automated Score:** 1/5 roadmap success criteria fully verified programmatically. 4 require human testing (SC-1, SC-2, SC-3, SC-5). SC-4 is the only criterion fully verifiable from code alone.

### Must-Haves from Plan Frontmatter — Merged Check

All four plans contributed must_haves. Summary:

**07-01 must_haves (test scaffolding):**

| Truth | Status | Evidence |
|-------|--------|----------|
| test-tab-bar.spec.ts contains skip-stubs for WIDGET-01 through WIDGET-04 | ✓ VERIFIED | File exists, 4 test.skip stubs confirmed, all 8 run as skipped (0 failed) |
| test-widget-zones.spec.ts contains skip-stubs for WIDGET-05 through WIDGET-07 | ✓ VERIFIED | File exists, 4 test.skip stubs (WIDGET-05, -06, -07, -08) confirmed |
| twitch-mock.html contains mock widget DOM elements for channel points and predictions | ✓ VERIFIED | community-points-summary, copo-balance-string, community-points-summary__claim-button, community-prediction-highlight-header, predictions-list-item__title, mock-prediction-widget all present |
| npm test passes with all new stubs skipped | ✓ VERIFIED | All 8 WIDGET stubs show as skipped (0 failed) when run in isolation via playwright |

**07-02 must_haves (tab bar):**

| Truth | Status | Evidence |
|-------|--------|----------|
| Tab bar with two tabs (AllChat and Twitch Chat) appears inside .chat-shell when AllChat loads on Twitch | ? HUMAN NEEDED | DOM construction code verified in twitch.ts (allchat-tab-bar, allchat-tab-allchat, allchat-tab-twitch, role=tablist, aria-label). Cannot verify actual injection on live Twitch without browser. |
| Clicking Twitch Chat tab hides AllChat container and restores native Twitch chat | ? HUMAN NEEDED | switchToTwitchTab() sets #allchat-container display:none and calls showNativeChat(). Code verified; runtime behavior needs human. |
| Clicking AllChat tab restores AllChat container and hides native chat | ? HUMAN NEEDED | switchToAllChatTab() restores display and calls hideNativeChat(). Code verified; runtime needs human. |
| Tab bar remains visible regardless of which tab is active | ? HUMAN NEEDED | Tab bar is not inside #allchat-container (it's a sibling in .chat-shell). Code pattern verified. Runtime needs human. |
| The old fixed-position Switch to AllChat button is no longer injected on Twitch | ✓ VERIFIED | PlatformDetector.handleSwitchToNative has guard: `if (!document.getElementById('allchat-tab-bar'))` before calling injectSwitchToAllChatButton. Confirmed at lines 279-280. |

**07-03 must_haves (ChatContainer tabBarMode):**

| Truth | Status | Evidence |
|-------|--------|----------|
| ChatContainer hides its header when tabBarMode is true | ✓ VERIFIED | `{!tabBarMode && (header div)}` at line 509. useState(false) at line 132. |
| Pop-out button remains visible inside the iframe when header is hidden | ✓ VERIFIED | `{tabBarMode && !isPoppedOut && !isPopOut && (floating pop-out button)}` at line 582. handlePopOut is real (not stub). |
| YouTube, Kick, and pop-out modes show the full header as before (no regression) | ? HUMAN NEEDED | tabBarMode defaults false, TAB_BAR_MODE only sent by Twitch content script onIframeCreated. Code logic is correct but runtime regression requires human. |
| ChatContainer listens for TAB_BAR_MODE postMessage and toggles header | ✓ VERIFIED | data.type === 'TAB_BAR_MODE' handler at line 226-228. setTabBarMode(data.enabled). |

**07-04 must_haves (widget extraction):**

| Truth | Status | Evidence |
|-------|--------|----------|
| Channel points widget clone appears in bottom zone when AllChat tab is active | ? HUMAN NEEDED | cloneWidgetIntoZone wired, WIDGET_SELECTORS.channelPoints with community-points-summary selector exists. Live selector validity requires human. |
| Transient widgets (predictions, polls, hype trains, raids) clone into top zone when they appear in native DOM | ? HUMAN NEEDED | MutationObserver on chatShell+stream-chat detects addedNodes and clones to top zone. Selector confidence LOW for polls/hype trains/raids. |
| Transient widget clones are removed when originals disappear from native DOM | ✓ VERIFIED | removeCloneForOriginal() called when mutation.removedNodes contains tracked original. Zones collapse when empty (maxHeight:0, borderTop:none). |
| Clones stay visually in sync with originals via MutationObserver | ✓ VERIFIED | cloneSyncObservers.set with MutationObserver on original, re-clones on any subtree/attribute change. |
| Click events on clones are forwarded to original elements via dispatchEvent | ✓ VERIFIED | setupEventForwarding with getElementPath/resolveElementByPath, .click() fallback to dispatchEvent(MouseEvent). |
| Widget zones only show when AllChat tab is active (hidden during Twitch Chat tab) | ✓ VERIFIED | Zones are children of #allchat-container. When tab switches, container display:none hides all zones automatically. |

**07-05 must_haves (verification/docs):**

| Truth | Status | Evidence |
|-------|--------|----------|
| User has verified tab bar and widget extraction on live Twitch | ✗ FAILED | 07-05-SUMMARY.md explicitly states: "Auto-approved per --auto mode; manual live-Twitch verification deferred to user." Human checkpoint was bypassed. |
| YouTube and Kick have no regressions | ? HUMAN NEEDED | Cannot verify without live browser testing. Code-level isolation is verified (tabBarMode defaults false). |
| README.md updated with tab bar and widget zone features | ✓ VERIFIED | README.md mentions tab bar (3 lines), widget, channel points, prediction. No internal implementation details present. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/test-tab-bar.spec.ts` | Tab bar E2E test stubs | ✓ VERIFIED | 4 WIDGET-01..04 test.skip stubs, all skip on run |
| `tests/test-widget-zones.spec.ts` | Widget zone E2E test stubs | ✓ VERIFIED | 4 WIDGET-05..08 test.skip stubs, all skip on run |
| `tests/fixtures/twitch-mock.html` | Mock Twitch fixture with widget DOM | ✓ VERIFIED | community-points-summary, community-prediction-highlight-header, all required selectors present |
| `src/content-scripts/twitch.ts` | Tab bar creation, injection, toggle logic + widget extraction | ✓ VERIFIED (substantive + wired) | allchat-tab-bar, padding-top:36px, TAB_BAR_MODE, WIDGET_SELECTORS, cloneNode, setupEventForwarding, getElementPath, resolveElementByPath, dispatchEvent, startWidgetDetection, stopWidgetDetection, cloneSyncObservers, removeCloneForOriginal — all 15 required patterns confirmed |
| `src/content-scripts/base/PlatformDetector.ts` | Refactored switch handlers, tab bar guards | ✓ VERIFIED | allchat-tab-bar guard in both handleSwitchToNative and handleSwitchToAllChat (lines 279-280, 297-298); injectSwitchToAllChatButton and removeSwitchToAllChatButton retained; onIframeCreated protected hook added |
| `src/ui/components/ChatContainer.tsx` | tabBarMode-aware header rendering | ✓ VERIFIED | useState(false), TAB_BAR_MODE handler, {!tabBarMode && header}, {tabBarMode && floating pop-out}, relative class on outer div |
| `README.md` | Updated documentation | ✓ VERIFIED | Tab bar, widget extraction, channel points, prediction documented; no implementation details |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| twitch.ts createInjectionPoint | #allchat-tab-bar | DOM injection into .chat-shell | ✓ WIRED | tabBar injected at line 653-670; startWidgetDetection called at line 702 |
| twitch.ts onIframeCreated | iframe contentWindow | TAB_BAR_MODE postMessage | ✓ WIRED | onIframeCreated override sends TAB_BAR_MODE with extensionOrigin (line 738-739) |
| PlatformDetector injectAllChatUI | #allchat-iframe-wrapper | createInjectionPoint returns iframeWrapper | ✓ WIRED | createInjectionPoint returns iframeWrapper (not container) so base class places iframe in correct flex zone |
| twitch.ts CONNECTION_STATE handler | #allchat-tab-conn-dot | updateTabBarConnDot in setupGlobalMessageRelay | ✓ WIRED | updateTabBarConnDot called at line 937 when CONNECTION_STATE message arrives |
| twitch.ts widget observer | .chat-shell native widget DOM | MutationObserver on chatShell + stream-chat | ✓ WIRED | startWidgetDetection observes chatShell (childList, subtree:false) + chatContent (childList, subtree:true) |
| twitch.ts clone click | original widget elements | setupEventForwarding via dispatchEvent | ✓ WIRED | getElementPath + resolveElementByPath + .click() + fallback dispatchEvent |
| iframe postMessage TAB_BAR_MODE | ChatContainer tabBarMode state | data.type === 'TAB_BAR_MODE' handler | ✓ WIRED | setTabBarMode(data.enabled) in handleIncomingMessage at line 226-228 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| twitch.ts widget zones | cloneMap (original->clone) | MutationObserver + cloneWidgetIntoZone | Yes — deep clones of live DOM nodes appended to zoneEl | ✓ FLOWING (from code) |
| ChatContainer.tsx tabBarMode | tabBarMode state | TAB_BAR_MODE postMessage from onIframeCreated | Yes — real boolean from content script | ✓ FLOWING |
| ChatContainer.tsx floating pop-out | handlePopOut | existing pop-out window open logic | Yes — real chrome.windows.create call (pre-existing feature) | ✓ FLOWING |
| twitch.ts connection dot | #allchat-tab-conn-dot background-color | CONNECTION_STATE from service worker | Yes — real state from WebSocket connection | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build produces dist/content-scripts/twitch.js with widget code | `grep -c 'allchat-tab-bar\|WIDGET_SELECTORS\|cloneWidgetIntoZone' dist/content-scripts/twitch.js` | 1 match (minified) | ✓ PASS |
| All 8 WIDGET test stubs skip (0 failed) | `npx playwright test tests/test-tab-bar.spec.ts tests/test-widget-zones.spec.ts` | 8 skipped, 0 failed | ✓ PASS |
| Build exits 0 | `npm run build` | webpack 5 compiled with 2 pre-existing warnings, 0 errors | ✓ PASS |
| Live Twitch tab bar and widget extraction | Manual browser testing | Auto-approved in 07-05 (not verified) | ✗ FAIL — human needed |

### Requirements Coverage

**Note:** WIDGET-01 through WIDGET-08 requirement IDs are declared in ROADMAP.md (Phase 7 Requirements field) but are NOT defined in REQUIREMENTS.md. REQUIREMENTS.md covers only v1 requirements (INJ, DS, KICK, TEST series). The WIDGET requirements exist only in the ROADMAP as phase-specific acceptance criteria. This is a documentation gap: the requirement definitions exist only in the plans, not in the central requirements document.

| Requirement | Source Plans | Description (from plans) | Status | Evidence |
|-------------|-------------|--------------------------|--------|----------|
| WIDGET-01 | 07-01, 07-02, 07-03, 07-05 | Tab bar appears in .chat-shell on Twitch pages | ? HUMAN NEEDED | DOM code verified; runtime requires live browser |
| WIDGET-02 | 07-01, 07-02, 07-05 | Clicking Twitch Chat tab hides AllChat iframe and shows native chat | ? HUMAN NEEDED | switchToTwitchTab() code verified; runtime needs human |
| WIDGET-03 | 07-01, 07-02, 07-05 | Clicking AllChat tab restores AllChat iframe and hides native chat | ? HUMAN NEEDED | switchToAllChatTab() code verified; runtime needs human |
| WIDGET-04 | 07-01, 07-02, 07-03, 07-05 | Tab bar persists when native chat tab is active | ✓ VERIFIED (code) | Tab bar is sibling of #allchat-container, not inside it; not hidden when container hides |
| WIDGET-05 | 07-01, 07-04, 07-05 | Widget zones injected into #allchat-container DOM | ✓ VERIFIED | allchat-widget-zone-top, allchat-iframe-wrapper, allchat-widget-zone-bottom created in createInjectionPoint |
| WIDGET-06 | 07-01, 07-04, 07-05 | Channel points widget clone appears in bottom zone | ? HUMAN NEEDED | cloneWidgetIntoZone with community-points-summary selector; live selector validity unknown |
| WIDGET-07 | 07-01, 07-04, 07-05 | Transient widget clone appears and disappears with original | ✓ VERIFIED (code) | MutationObserver addedNodes/removedNodes cycle + removeCloneForOriginal confirmed |
| WIDGET-08 | 07-01, 07-05 | Existing test suite still passes (no regressions) | ✓ VERIFIED (partial) | 8 WIDGET stubs skipped, 0 failed. Pre-existing test failures (Kick E2E, YouTube SPA, design system — 17 total) predate Phase 7. Platform regression (YouTube/Kick runtime) requires human. |

**Orphaned requirements in REQUIREMENTS.md:** WIDGET-01..08 are not mapped in REQUIREMENTS.md Traceability table. The table ends at Phase 4 (TEST-07). Phase 5, 6, and 7 requirements (D-01..D-17, WIDGET-01..WIDGET-08) are absent. This is an existing documentation gap not introduced by Phase 7.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| tests/test-tab-bar.spec.ts | 4-26 | `test.skip()` stubs (8 total) | ℹ️ Info | Intentional by design — Wave 0 scaffolding per plan. These are pre-acceptance criteria stubs, not unintended placeholders. Live Twitch DOM is required to implement them. |
| tests/test-widget-zones.spec.ts | 4-31 | `test.skip()` stubs | ℹ️ Info | Same as above — intentional |
| src/content-scripts/twitch.ts | 82, 108, 170 | `return null` | ℹ️ Info | Graceful degradation guards (findWidget returns null if no match; resolveElementByPath returns null if index out of range; cloneWidgetIntoZone returns null if zone not in DOM). Not stubs. |

No blocker anti-patterns found. No TODO/FIXME/PLACEHOLDER patterns in implementation files.

### Human Verification Required

#### 1. Channel Points Widget Visibility and Interactivity

**Test:** Load the built extension on a live Twitch stream while logged in. With AllChat tab active, check the bottom of the chat area for channel points balance and claim button.
**Expected:** Channel points widget (balance + claim button) appears in #allchat-widget-zone-bottom below the AllChat iframe. Clicking the claim button updates points balance.
**Why human:** Widget selectors (community-points-summary) are LOW confidence from 2026-04. Graceful degradation means the extension runs silently if selectors have rotted. Only live DOM inspection can confirm.

#### 2. Transient Widgets (Predictions/Polls)

**Test:** Watch a streamer who runs a prediction or poll. Verify the prediction/poll card appears in the top widget zone while AllChat tab is active. Attempt to vote.
**Expected:** Prediction/poll clone appears in #allchat-widget-zone-top. Clicking the vote option dispatches the real Twitch vote action (vote registers).
**Why human:** Transient widget detection requires a live stream event (prediction started). Selectors for polls, hype trains, and raids are LOW confidence. Cannot replicate with mock fixture.

#### 3. Tab Switching State Preservation

**Test:** Switch from AllChat to Twitch Chat tab and back. Verify AllChat messages are still present after switching back. Verify Twitch native chat state is preserved (not reloaded). Verify tab bar remains visible at all times.
**Expected:** Instant switching, no data loss, tab bar persistent.
**Why human:** State preservation depends on live iframe content and Twitch React state. Cannot verify cross-view state consistency without a running browser session.

#### 4. YouTube and Kick Regression Check

**Test:** Navigate to a live YouTube stream and a live Kick stream with the extension active. Verify the full ChatContainer header appears (InfinityLogo, connection dot, switch-to-native button). Verify no tab bar appears.
**Expected:** YouTube and Kick operate exactly as in Phase 6 — tabBarMode remains false, full header visible, switch-to-native button present.
**Why human:** Platform isolation is enforced by code (tabBarMode=false default, TAB_BAR_MODE only sent by Twitch onIframeCreated). Runtime regression requires live multi-platform testing.

#### 5. Pop-out Mode on Twitch

**Test:** On Twitch in-page view (AllChat tab active), click the floating pop-out button (top-right corner of iframe). Verify the pop-out window opens with the full ChatContainer header (not tabBarMode). Close the pop-out and verify in-page chat is restored.
**Expected:** Pop-out renders full header (tabBarMode=false in pop-out window since it's not sent TAB_BAR_MODE by Twitch content script when isPopOut=true). Closing pop-out restores in-page state.
**Why human:** Pop-out window lifecycle requires chrome.windows.create with live extension loaded. Cross-window messaging cannot be tested offline.

### Gaps Summary

**No hard blockers from code verification.** All implementation artifacts exist, are substantive (not stubs), and are wired end-to-end. The build succeeds. The 8 test stubs skip correctly.

**The critical gap is the bypassed human-verify checkpoint.** Plan 07-05, Task 3 was a `type="checkpoint:human-verify" gate="blocking"` task that was auto-approved in --auto mode. The 07-05-SUMMARY.md explicitly states manual live-Twitch verification was deferred to the user. This is the primary reason for `human_needed` status.

**Secondary gap:** WIDGET requirement IDs (WIDGET-01..WIDGET-08) are not defined in REQUIREMENTS.md. They exist in ROADMAP.md and plan frontmatter only. The REQUIREMENTS.md Traceability table ends at Phase 4. This is a documentation gap that should be addressed.

---

_Verified: 2026-04-12T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
