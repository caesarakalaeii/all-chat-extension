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
 * Extension-specific types for communication between components
 */

import { API_BASE_URL } from '../../config';

export interface StreamerInfo {
  username: string;
  display_name: string;
  platforms: PlatformInfo[];
}

export interface PlatformInfo {
  platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';
  channel_id: string;
  channel_name: string;
  is_active: boolean;
}

export interface ViewerInfo {
  id: string;
  username: string;
  display_name: string;
  platform: 'twitch' | 'youtube' | 'kick';
}

/**
 * Messages between content script and service worker
 */
export type ExtensionMessage =
  | { type: 'GET_STREAMER_INFO'; username: string }
  | { type: 'CONNECT_WEBSOCKET'; streamerUsername: string }
  | { type: 'DISCONNECT_WEBSOCKET' }
  | { type: 'SEND_CHAT_MESSAGE'; streamerUsername: string; message: string }
  | { type: 'DO_LOGIN'; platform: 'twitch' | 'youtube' | 'kick'; streamerUsername?: string }
  | { type: 'OPEN_AUTH_TAB'; platform: 'twitch' | 'youtube' | 'kick'; streamerUsername?: string }
  | { type: 'GET_AUTH_STATUS' }
  | { type: 'GET_COSMETICS' }
  | { type: 'GET_CONNECTION_STATE' }
  | { type: 'LOGOUT' }
  | { type: 'STORE_VIEWER_TOKEN'; token: string }
  | { type: 'SAVE_NAME_COLOR'; color: string | null }
  | { type: 'SAVE_NAME_GRADIENT'; gradient: string | null }
  | { type: 'SET_CURRENT_PLATFORM'; platform: string }
  | { type: 'EXTENSION_STATE_CHANGED'; enabled: boolean };

export type ExtensionResponse =
  | { success: true; data?: any }
  | { success: false; error: string; data?: any };

/**
 * Per-platform enable state
 */
export type PlatformEnabled = {
  twitch: boolean;
  youtube: boolean;
  youtubeStudio: boolean;
  kick: boolean;
};

/**
 * Storage schemas
 */
export interface LocalStorage {
  viewer_jwt_token?: string;
  viewer_info?: ViewerInfo;
  viewer_name_color?: string;
  viewer_name_gradient?: string; // JSON-serialized NameGradient, e.g. '{"type":"linear","colors":["#9146ff","#00b5ad"],"angle":90}'
  ui_collapsed?: boolean;
  // Pop-out window dimension persistence (D-07)
  popout_window_width?: number;
  popout_window_height?: number;
  popout_window_x?: number;
  popout_window_y?: number;
  // Pop-out message buffer for history transfer (D-08)
  popout_message_buffer?: string;
}

export interface SyncStorage {
  apiGatewayUrl: string;
  platformEnabled: PlatformEnabled;
  preferences: {
    autoDetectEnabled: boolean;
    replaceNativeChat: boolean;
    fontSize: 'small' | 'medium' | 'large';
  };
}

export const DEFAULT_SETTINGS: SyncStorage = {
  apiGatewayUrl: API_BASE_URL,
  platformEnabled: {
    twitch: true,
    youtube: true,
    youtubeStudio: true,
    kick: true,
  },
  preferences: {
    autoDetectEnabled: true,
    replaceNativeChat: true,
    fontSize: 'medium',
  },
};
