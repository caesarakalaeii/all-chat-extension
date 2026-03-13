# Code Conventions

## Languages & Typing

- **TypeScript** with strict mode enabled (`tsconfig.json`)
- No `any` types — explicit type annotations throughout
- Discriminated unions and type guards for error handling (see `src/lib/errorParser.ts`)

## Naming

| Context | Convention | Example |
|---------|------------|---------|
| Files (general) | camelCase | `errorParser.ts`, `youtubeUtils.ts` |
| React components | PascalCase | `ChatOverlay.tsx` |
| Functions | camelCase | `getCurrentStreamer()` |
| Type guards | `is*` prefix | `isStreamActive()` |
| Constants | UPPER_SNAKE or camelCase | varies |

## Imports

Ordering convention:
1. External dependencies
2. Type imports (`import type { ... }`)
3. Relative imports
4. Path aliases

## Error Handling

- Discriminated union patterns for typed errors
- Type guard functions for narrowing (centralized in `src/lib/errorParser.ts`)
- No silent swallows — errors are surfaced or logged

## Logging

- `console.log/warn/error` with `[Module]` prefix for traceability
- Example: `console.log('[YouTubeHandler] stream detected')`

## React / UI

- Functional components only (no class components)
- Tailwind CSS for styling
- Dark theme as default
- Component files use `.tsx` extension

## Extension Patterns

- Content scripts injected into YouTube pages
- Optional chaining (`?.`) used extensively for DOM queries
- Cleanup functions ensure no duplicate injections
