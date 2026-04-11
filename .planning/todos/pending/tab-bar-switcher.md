---
name: Redesign switch-to-native as tab bar
description: Replace the small "go back to native" button with a persistent tab bar switcher [AllChat] | [Twitch Chat]
priority: medium
date: 2026-04-12
---

# Redesign Switch-to-Native as Tab Bar

Replace the current small "switch to native" button with a persistent tab bar above the chat area:

```
[ AllChat ]  [ Twitch Chat ]
```

- Both views stay mounted — switching is instant, no reload or state loss
- Existing `SWITCH_TO_NATIVE` infrastructure can be reused
- Tab bar should be injected by the content script (not inside the iframe) so it controls both views
- Platform name in the tab should be dynamic (Twitch/YouTube/Kick)
- Active tab gets visual indicator (underline, background, etc.)

This should be bundled with the native widget extraction phase since both address the "additive not subtractive" principle.
