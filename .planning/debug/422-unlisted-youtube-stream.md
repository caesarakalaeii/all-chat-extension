---
status: investigating
trigger: "Users get a 422 error when trying to send messages via the AllChat extension to an unlisted YouTube stream"
created: 2026-04-09T00:00:00Z
updated: 2026-04-09T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — The 422 originates from the YouTube liveChat/messages insert API when given a liveChatId derived from an unlisted stream that was discovered via search.list (which only indexes public streams). The description "422 from allch.at" is imprecise: the allch.at backend returns 502 wrapping YouTube's 422.
test: Traced all three lookup strategies; all fail for unlisted streams.
expecting: n/a — root cause fully confirmed through code analysis
next_action: Document root cause and suggest fix directions

## Symptoms

expected: User should be able to send chat messages to unlisted YouTube streams through the AllChat extension overlay
actual: The extension/backend returns a 422 error when attempting to send messages to an unlisted stream
errors: HTTP 422 from the allch.at backend API
reproduction: Open an unlisted YouTube stream, try to send a message through the AllChat extension UI
started: Unknown — may never have worked for unlisted streams

## Eliminated

- hypothesis: Backend has a visibility check / "unlisted" guard returning 422 directly
  evidence: Searched all Go source in api-gateway and auth-service — zero occurrences of 422 / StatusUnprocessableEntity. No explicit unlisted check.
  timestamp: 2026-04-09

- hypothesis: The 422 is returned directly by the allch.at backend API
  evidence: When sendYouTubeMessage fails (for any reason), the auth-service returns HTTP 502 StatusBadGateway, not 422. The proxy in api-gateway transparently forwards this status code. The 422 visible to the user is inside the `details` field string ("youtube API error: status=422 body=...").
  timestamp: 2026-04-09

## Evidence

- timestamp: 2026-04-09
  checked: auth-service/handlers/chat_send.go — getActiveYouTubeChannelID SQL query
  found: |
    SELECT ocs.channel_id FROM overlay_chat_sources ocs
    INNER JOIN overlays o ON ocs.overlay_id = o.id
    WHERE o.user_id = $1
      AND ocs.platform = 'youtube'
      AND ocs.is_active = true
      AND o.is_public_for_viewers = true
    LIMIT 1
  implication: This query succeeds only if the streamer has an active overlay marked public for viewers. If not set up, this step already fails with 502 "no active YouTube source found for streamer". This step passes for streamers who have set up an overlay.

- timestamp: 2026-04-09
  checked: auth-service/handlers/chat_send.go — getYouTubeLiveChatIDWithVideoID (3 strategies)
  found: |
    Strategy 1: Redis lookup (youtube:stream:state:{channelID}) — populated by youtube-listener
    Strategy 2: videos.list with extension-provided video_id — only triggered if req.VideoID != ""
    Strategy 3: YouTube search.list with eventType=live fallback
  implication: Strategy 2 (the reliable path for unlisted streams) is NEVER triggered because the extension never sends video_id.

- timestamp: 2026-04-09
  checked: extension/src/ui/components/MessageInput.tsx and extension/src/lib/types/viewer.ts
  found: SendMessageRequest type has { streamer_username, message, platform? } — no video_id field. Request body never includes video_id.
  implication: The backend Strategy 2 (videos.list with video_id) is always bypassed.

- timestamp: 2026-04-09
  checked: youtube-listener/api/client.go — GetLiveStreams, line 119
  found: call := c.service.Search.List([]string{"id", "snippet"}).ChannelId(channelID).EventType("live").Type("video")
  implication: The youtube-listener uses search.list with EventType("live"), which only indexes PUBLIC live streams. Unlisted streams are not indexed. Therefore the Redis cache (Strategy 1) will always be empty for unlisted streams.

- timestamp: 2026-04-09
  checked: auth-service/handlers/chat_send.go — getYouTubeLiveChatIDFromAPI fallback
  found: searchURL uses &eventType=live — same as youtube-listener. Returns 0 results for unlisted streams → error "streamer is not currently live on YouTube (no live videos found for channel X)" → sendYouTubeMessage returns error → HandleSendMessage returns HTTP 502 with `details` containing the error string.
  implication: All three lookup strategies fail for unlisted streams. The message never reaches YouTube's liveChat/messages API at all.

- timestamp: 2026-04-09
  checked: Where does the 422 actually come from?
  found: If somehow a liveChatId IS obtained (e.g., through Strategy 2 if video_id were sent), the YouTube liveChat/messages insert API returns 422 when the video's live chat is not accessible to the inserting user (e.g., the viewer's YouTube account doesn't have permission to post to that chat, or the stream is truly inaccessible). The 422 in the user report likely comes from a scenario where liveChatId was resolved somehow (e.g., from Redis if the stream was briefly public) but YouTube rejects the insert.
  implication: The 422 is a YouTube API error embedded in backend's 502 response body, not a direct allch.at 422.

## Resolution

root_cause: |
  Unlisted YouTube streams cannot be supported with the current architecture because:
  1. The youtube-listener uses search.list with eventType=live (public-only) to populate Redis — unlisted streams never appear in Redis.
  2. The search.list fallback in the auth-service also uses eventType=live — same limitation.
  3. The extension never sends video_id in its SendMessageRequest, so Strategy 2 (videos.list with a direct video_id, which CAN work for unlisted) is never triggered.
  
  The actual HTTP error the user observes is 502 from allch.at, with a details string that contains "youtube API error: status=422". The 422 from YouTube occurs when the liveChat/messages insert is attempted with a liveChatId that YouTube considers inaccessible (either because the stream is unlisted/private or the live chat is not enabled for the video).
  
  The deepest root cause is: the system has no mechanism to discover the liveChatId for unlisted streams because all discovery paths depend on YouTube's public search index.

fix: |
  To support unlisted streams, the extension must pass the YouTube video ID to the backend:
  1. Extension: Extract the video ID from the current YouTube page URL (window.location or content script) and include it as video_id in SendMessageRequest.
  2. Update SendMessageRequest interface in extension (src/lib/types/viewer.ts) to include video_id?: string.
  3. Update MessageInput.tsx to read the video ID and include it in the request body.
  4. The backend already supports this via Strategy 2 (getYouTubeLiveChatIDFromVideoID using videos.list, which works for unlisted streams when the viewer has permission).
  Note: Even with this fix, posting messages to an unlisted stream's live chat requires that the viewer's YouTube OAuth token has permission. YouTube may still reject with 422 if the account is not allowed.

verification:
files_changed: []
