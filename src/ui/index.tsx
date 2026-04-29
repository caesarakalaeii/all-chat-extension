/**
 * This file is part of All-Chat Extension.
 * Copyright (C) 2026 caesarakalaeii
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Chat UI Entry Point
 *
 * React app that renders the chat interface inside the iframe
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import ChatContainer, { Platform } from './components/ChatContainer';
import ErrorBoundary from './components/ErrorBoundary';
import './styles.css';

const manifest = chrome.runtime.getManifest();

// Read platform and streamer from URL params (set by the content script in the iframe src).
// This avoids postMessage for init — content scripts report the page origin, not the extension
// origin, so a postMessage-based init would be blocked by the KICK-05 origin check.
const params = new URLSearchParams(location.search);
const platform = params.get('platform');
const streamer = params.get('streamer');
const displayName = params.get('display_name') || streamer;
const twitchChannel = params.get('twitch_channel') || undefined;
const videoId = params.get('video_id') || undefined;

if (platform && streamer) {
  console.log('[AllChat UI] Initializing with:', { platform, streamer, displayName, twitchChannel, videoId });
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(
    <ErrorBoundary>
      <ChatContainer platform={platform as Platform} streamer={streamer} displayName={displayName!} twitchChannel={twitchChannel} videoId={videoId} />
    </ErrorBoundary>
  );
} else {
  console.log(`[AllChat UI] Waiting for initialization... v${manifest.version}`);
}
