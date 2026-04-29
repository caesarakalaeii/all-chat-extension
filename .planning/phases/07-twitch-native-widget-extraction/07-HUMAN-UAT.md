---
status: partial
phase: 07-twitch-native-widget-extraction
source: [07-VERIFICATION.md]
started: 2026-04-12T20:45:00Z
updated: 2026-04-12T20:45:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Channel points widget on live Twitch
expected: Channel points balance, claim button, and redemption menu visible and functional in bottom widget zone while AllChat is active
result: [pending]

### 2. Predictions/polls transient widgets
expected: Predictions and polls UI appears in top widget zone when live, disappears when event ends
result: [pending]

### 3. Tab switching state preservation
expected: Switching between AllChat and Twitch Chat tabs is instant with no state loss in either view; native chat stays mounted (hidden) when AllChat is active
result: [pending]

### 4. YouTube/Kick regression
expected: YouTube and Kick function normally — no tab bar, no widget zones, full header visible, all existing features work
result: [pending]

### 5. Pop-out mode on Twitch
expected: Pop-out mode renders full ChatContainer header (not tabBarMode); floating pop-out button visible when on Twitch in-page; closing pop-out restores in-page chat without regression
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
