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
 * Viewer authentication types
 */

export interface ViewerInfo {
  id: string;
  platform: string;
  username: string;
  display_name: string;
  avatar_url?: string;
}

export interface ViewerSession {
  token: string;
  expiresAt: number; // Unix timestamp
  viewer: ViewerInfo;
}

export interface SendMessageRequest {
  streamer_username: string;
  message: string;
  platform?: string;
  video_id?: string; // YouTube video ID from extension — enables cheap liveChatId lookup
}

export interface SendMessageResponse {
  success: boolean;
  message: string;
  error?: string;
  details?: string;
  reset_time?: number;
}
