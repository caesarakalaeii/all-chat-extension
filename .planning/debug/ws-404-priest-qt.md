---
status: awaiting_human_verify
trigger: "WebSocket connection to wss://allch.at/ws/chat/priest_qt?token=TOKEN failed: Error during WebSocket handshake: Unexpected response code: 404"
created: 2026-04-01T00:00:00Z
updated: 2026-04-01T00:01:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — new overlays default to is_public_for_viewers = false, causing GetPublicOverlayByUsername to return empty string, triggering a 404 before the WebSocket upgrade
test: Verified via code reading: HandleCreateOverlay never sets IsPublicForViewers; it defaults to Go zero value (false)
expecting: Fix: set IsPublicForViewers = true by default in HandleCreateOverlay
next_action: Apply fix to overlay-manager/handlers/overlay.go

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: WebSocket connection to wss://allch.at/ws/chat/{channel}?token=TOKEN should establish successfully
actual: WebSocket handshake fails with HTTP 404 response code
errors: "websocket connection to wss://allch.at/ws/chat/priest_qt?token=TOKEN failed: Error during WebSocket handshake: Unexpected response code: 404"
reproduction: Unknown — reported by a user. Unclear if it affects all channels or just priest_qt.
started: Unknown — user didn't specify when it started working or broke.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Path mismatch between extension WS URL and backend route
  evidence: Backend has exact route GET /ws/chat/:streamer_username at api-gateway/cmd/main.go:343; extension constructs /ws/chat/{streamerUsername} — paths match
  timestamp: 2026-04-01

- hypothesis: Case sensitivity mismatch between auth-service username lookup and WS query
  evidence: Both queries operate on the same stored username; auth-service returns user.Username as stored; WS uses that value directly
  timestamp: 2026-04-01

- hypothesis: pgx ErrNoRows string comparison bug in GetPublicOverlayByUsername
  evidence: pgx v5 ErrNoRows.Error() == "no rows in result set" (confirmed in pgx v5.7.5 source); string comparison works
  timestamp: 2026-04-01

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-01
  checked: api-gateway/cmd/main.go routes
  found: Route GET /ws/chat/:streamer_username exists at line 343; calls viewerWsHandler.HandleViewerChatConnection
  implication: Path is correct; 404 must come from inside the handler

- timestamp: 2026-04-01
  checked: api-gateway/handlers/websocket_viewer.go
  found: 404 is returned at line 118 when GetPublicOverlayByUsername returns empty string
  implication: The DB query finds no overlay matching the conditions

- timestamp: 2026-04-01
  checked: api-gateway/subscription/repository.go:GetPublicOverlayByUsername
  found: Query requires u.username = $1 AND o.is_active = true AND o.is_public_for_viewers = true AND u.is_banned = false
  implication: All four conditions must be true; if any fails, 404 is returned

- timestamp: 2026-04-01
  checked: overlay-manager/handlers/overlay.go:HandleCreateOverlay
  found: overlay struct is created without setting IsPublicForViewers; Go zero value = false; no default of true is applied
  implication: ALL new overlays have is_public_for_viewers = false unless explicitly set via PUT /overlays/:id

- timestamp: 2026-04-01
  checked: migrations/013_add_public_overlay_flag.sql
  found: DB column default is also false: BOOLEAN NOT NULL DEFAULT false
  implication: Confirms the default; any user who never updated their overlay via the dashboard has is_public_for_viewers = false

- timestamp: 2026-04-01
  checked: auth-service/handlers/streamer_info.go:HandleGetStreamerInfo
  found: Streamer info query filters by is_public_for_viewers = true, so platforms list is empty for affected users, but still returns HTTP 200 with user object
  implication: Extension receives StreamerInfo with empty platforms array but still calls connectWebSocket because it only null-checks the response

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: overlay-manager/handlers/overlay.go HandleCreateOverlay never sets IsPublicForViewers on the new overlay struct, so it defaults to false. All overlays created without an explicit PUT to set is_public_for_viewers=true will cause viewer WebSocket connections to return 404 because GetPublicOverlayByUsername finds no matching row.
fix: Set IsPublicForViewers = true by default in HandleCreateOverlay (first overlay for a user is always public). Also: the HandleCloneOverlay function intentionally sets it to false (correct behavior — clones should not auto-publish).
verification: Fix compiles cleanly (go build ./...). All overlay-manager tests pass. Fix sets IsPublicForViewers: true in HandleCreateOverlay so new overlays are immediately accessible to viewers without requiring a manual PUT update.
files_changed:
  - services/overlay-manager/handlers/overlay.go
