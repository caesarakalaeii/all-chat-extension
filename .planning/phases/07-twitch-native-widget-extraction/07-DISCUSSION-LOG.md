# Phase 7: Twitch Native Widget Extraction - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 07-twitch-native-widget-extraction
**Areas discussed:** Widget placement, Tab bar design, Extraction method, Widget scope

---

## Widget Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Above AllChat | Widgets render in a bar above the AllChat iframe, inside .chat-shell. Content script controls this. | |
| Below header, above msgs | Widgets render inside the iframe, between header and message list. Requires cross-boundary DOM movement. | |
| Floating overlay | Widgets float over the AllChat chat area as dismissible cards. | |

**User's choice:** Other — "try to match the native twitch positioning, changing it causes friction"

**Follow-up: Two-zone layout**

| Option | Description | Selected |
|--------|-------------|----------|
| Two widget zones | Content script creates top zone (predictions/polls) and bottom zone (channel points). Matches native Twitch. | ✓ |
| All widgets top | Stack everything above the iframe for simplicity. Channel points moves from bottom to top. | |
| All widgets bottom | Stack everything below the iframe. Predictions/polls move from top to bottom. | |

**User's choice:** Two widget zones (Recommended)
**Notes:** User prioritized matching native Twitch positioning to minimize friction. Native Twitch puts predictions/polls at top of chat and channel points at bottom.

---

## Tab Bar Design

### Tab bar location

| Option | Description | Selected |
|--------|-------------|----------|
| Above everything | Tab bar is topmost element in .chat-shell. Always visible. | |
| Replace AllChat header | Tab bar replaces the AllChat iframe header (InfinityLogo bar). Saves vertical space. | ✓ |
| Compact inline toggle | Smaller segmented control in the existing AllChat header. | |

**User's choice:** Replace AllChat header
**Notes:** Saves vertical space, InfinityLogo moves into the AllChat tab label.

### Tab switch behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Widgets hide, full native | Widget zones disappear, native Twitch chat fully restored. | |
| Widgets stay, chat swaps | Widget zones stay visible. Only message area swaps. | |
| Full swap | Tab bar stays, everything below becomes native Twitch chat. | ✓ |

**User's choice:** Full swap
**Notes:** Clean mental model — tab bar persists, everything below is either AllChat view or native Twitch.

### Tab bar visual style

| Option | Description | Selected |
|--------|-------------|----------|
| Match Twitch tabs | Style to look like Twitch's own tab controls. | |
| AllChat design system | Use AllChat's OkLCh tokens, Inter font. | ✓ |
| Minimal/neutral | Plain dark background, subtle text. | |

**User's choice:** AllChat design system
**Notes:** Makes it clear this is an AllChat feature. Consistent branding.

---

## Extraction Method

### Initial presentation (rejected by user for more detail)

User requested full pros/cons analysis before deciding. Detailed breakdown provided covering:
1. CSS Reposition — likely impossible due to `height: 0` hiding strategy
2. Reparent (move nodes) — React reconciliation fights against moved nodes
3. Clone + event forwarding — most reliable display, needs event forwarding
4. Selective hiding (new option) — surgically hide only messages, leave widgets visible

### Final decision

| Option | Description | Selected |
|--------|-------------|----------|
| Selective hiding | Surgically hide only messages/input, leave widgets visible. Simplest. | |
| Clone + event forwarding | Clone widgets, forward click events to hidden originals. Most resilient. | ✓ |
| Hybrid approach | Start with selective hiding, fall back to clone+sync where needed. | |

**User's choice:** Clone + event forwarding
**Notes:** User valued power and reliability over simplicity. Clone approach gives most control and is robust against Twitch layout restructuring.

---

## Widget Scope

### Which widgets

| Option | Description | Selected |
|--------|-------------|----------|
| Channel points | Points balance, claim bonus, redemption menu. Persistent. | ✓ |
| Predictions | Prediction cards when streamer starts one. Dynamic. | ✓ |
| Polls | Poll cards when streamer starts one. Dynamic. | ✓ |
| Hype train + raids | Hype train progress bar and raid banners. Transient. | ✓ |

**User's choice:** All four — full scope
**Notes:** Consistent with "additive, never subtractive" principle.

### Dynamic widget handling

| Option | Description | Selected |
|--------|-------------|----------|
| Observe + auto-clone | MutationObserver watches for new widgets. Auto-clone on appear, remove on disappear. | ✓ |
| Poll on interval | Check every N seconds. Simpler but less responsive. | |
| Event-driven via Twitch | Hook into PubSub/EventSub. Most control but requires re-implementing widget UIs. | |

**User's choice:** Observe + auto-clone (Recommended)
**Notes:** Consistent with existing MutationObserver patterns in the codebase.

---

## Claude's Discretion

- Exact widget CSS selectors (to be verified against live Twitch DOM during research)
- MutationObserver configuration for widget detection (subtree depth, attribute filters)
- Element mapping strategy for clone → original event forwarding
- How to communicate tab bar state between content script and iframe (postMessage protocol)
- Default tab on load (AllChat or native — likely AllChat since that's why the extension is installed)

## Deferred Ideas

- YouTube widget extraction (Super Chat, memberships, polls)
- Kick widget extraction (sub gifting, polls, slow mode)
- Tab bar on YouTube/Kick platforms
