# Deferred Items — Phase 02 Design System

## From Plan 02-04

### ErrorDisplay.tsx — gray-scale class migration

**Discovered during:** Task 2 (token migration)
**File:** src/ui/components/ErrorDisplay.tsx
**Issue:** Six gray-scale classes remain on lines 99-101 and 107-109:
- `bg-gray-50`, `border-gray-200`, `text-gray-800` (x2 sets)
These are light-mode fallback colors, outside the 5 components scoped in plan 02-04.
**Action needed:** Migrate in a follow-up plan or include in a sweep of all remaining components.
