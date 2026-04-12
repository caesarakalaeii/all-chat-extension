---
name: YouTube/Kick native widget extraction
description: Extend native widget extraction to YouTube (Super Chat, memberships) and Kick after Twitch implementation is proven
trigger_condition: After Twitch native widget extraction phase is completed and validated
planted_date: 2026-04-12
---

# YouTube/Kick Native Widget Extraction

Once Twitch native widget extraction is proven, extend the approach to other platforms:

## YouTube
- Super Chat highlights and pinned messages
- Membership badge/welcome messages
- Poll widgets
- Slow mode / members-only indicators

## Kick
- Sub gifting notifications
- Polls
- Slow mode indicators
- Host/raid events

## Notes
- Each platform's widget DOM structure is completely different — expect per-platform implementation work
- YouTube uses Polymer (not React) so extraction strategy may differ
- Kick's feature set is smaller, likely less work
- The extraction pattern established in the Twitch phase should inform a reusable approach
