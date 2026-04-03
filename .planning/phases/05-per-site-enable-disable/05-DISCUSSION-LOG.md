# Phase 5: Per-site Enable/Disable - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 05-per-site-enable-disable
**Areas discussed:** Granularity level, User controls, Default behavior, State feedback

---

## Granularity Level

| Option | Description | Selected |
|--------|-------------|----------|
| Per-platform only | Toggle Twitch/YouTube/Kick independently. Simple: 3 booleans in storage. | ✓ |
| Per-channel | Toggle individual channels (e.g. disable on twitch.tv/xqc). Flexible but needs growing list. | |
| Per-platform + per-channel | Platform-level defaults with per-channel overrides. Most powerful, more complex UI. | |

**User's choice:** Per-platform only
**Notes:** Clean and simple — 3 booleans covers the primary use case.

---

## User Controls

### Toggle placement

| Option | Description | Selected |
|--------|-------------|----------|
| Replace global toggle | Remove single on/off switch, show 3 platform toggles in popup | ✓ |
| Keep global + add per-platform | Global toggle stays as master switch, plus individual platform toggles | |
| You decide | Claude picks based on existing popup layout | |

**User's choice:** Replace global toggle

### Apply mode

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate | Toggle injects/removes iframe live via EXTENSION_STATE_CHANGED | ✓ |
| Reload tab | Toggle reloads affected tabs (current behavior) | |

**User's choice:** Immediate

### Current tab highlight

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, highlight current | Detect current tab's platform and emphasize that row | ✓ |
| No, treat all equal | All 3 platform toggles shown equally | |

**User's choice:** Yes, highlight current

---

## Default Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| All enabled | Twitch, YouTube, and Kick all active out of the box | ✓ |
| All disabled | User must opt-in per platform | |
| Only current platform | Enable only the platform the user first visits | |

**User's choice:** All enabled
**Notes:** Matches current behavior where extensionEnabled defaults to true.

---

## State Feedback

### Status indicator

| Option | Description | Selected |
|--------|-------------|----------|
| Extension icon badge | Color/text on icon for at-a-glance status | ✓ |
| Popup status only | Show state only in popup when clicked | |
| Both icon + popup | Badge on icon plus detailed state in popup | |

**User's choice:** Extension icon badge

### Badge appearance

| Option | Description | Selected |
|--------|-------------|----------|
| Gray out icon | Use grayscale icon when disabled for current platform | ✓ |
| "OFF" text badge | Small text badge reading 'OFF' | |
| You decide | Claude picks approach that doesn't conflict with connection badges | |

**User's choice:** Gray out icon
**Notes:** Avoids conflicting with existing connection state badges (checkmark/X/exclamation).

---

## Claude's Discretion

- Storage migration strategy for existing users
- Exact popup layout/styling for three toggles
- Icon grayscale implementation approach
- Content script notification strategy (targeted vs broadcast)

## Deferred Ideas

None — discussion stayed within phase scope.
