---
name: Native injection research
description: Research findings on 7TV/BTTV/FFZ injection approach vs AllChat iframe replacement, and the "additive not subtractive" design principle
type: exploration
date: 2026-04-12
---

# Native Chat Injection vs. Iframe Replacement

## Context

A developer asked why AllChat doesn't inject messages directly into the native chat container like 7TV does. This prompted research into feasibility and tradeoffs.

## Key Findings

### How 7TV/BTTV/FFZ Do It

- All three inject INTO native chat — none replace it
- Primary technique is **React Fiber hooking** (`__reactFiber$` / `__reactInternalInstance$` properties on DOM elements)
- They traverse React's internal fiber tree, patch component prototypes (`componentDidUpdate`, `render`), and wrap native methods with `defineFunctionHook()`
- MutationObserver is only used as a bootstrapping mechanism to detect when target nodes appear
- Runs outside the Isolated World (full page context) to access React internals
- All three regularly break on platform deploys and conflict with each other over the same DOM
- Per-platform modules are completely separate (different React Fiber strategies for Twitch vs Kick vs YouTube Polymer)

### Why It Doesn't Fit AllChat

AllChat's core value is **cross-platform message aggregation** — showing Twitch, YouTube, and Kick messages in one view. 7TV only adds emotes to one platform's existing message stream.

Injecting a YouTube message into Twitch's React fiber tree is architecturally mismatched — you'd fight React's reconciliation cycle to prevent your injected nodes from being garbage collected on every re-render. You'd essentially rebuild what the iframe already does, except coupled to platform internals.

### The Real Problem

The "why not inject into native" question was really about AllChat being **subtractive** — users lose channel points, predictions, polls, and other native features when the extension replaces their chat. The answer isn't to change the injection architecture; it's to make AllChat additive.

## Design Principle

> **AllChat is additive, never subtractive.** Users should gain cross-platform aggregation without losing any native platform functionality.

## Decided Architecture

- **Keep iframe** for the message stream (stable, cross-platform, CSS-isolated)
- **Extract native platform widgets** (channel points, predictions, polls) from the native chat DOM and reposition them alongside the AllChat iframe
- **Tab bar switcher** (`[AllChat] | [Twitch Chat]`) replacing the small "go back to native" button
- Moving whole widget nodes is far less fragile than React Fiber message injection

## Sources

- [SevenTV/Extension](https://github.com/SevenTV/Extension) — ChatModule.vue, ReactHooks.ts
- [FFZ/7TV compatibility issue #1349](https://github.com/FrankerFaceZ/FrankerFaceZ/issues/1349)
- [SevenTV/ExtensionV3](https://github.com/SevenTV/ExtensionV3) (archived)
