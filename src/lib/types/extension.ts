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
  | { type: 'START_AUTH'; platform: 'twitch' | 'youtube' | 'kick'; streamerUsername?: string }
  | { type: 'EXCHANGE_CODE'; platform: 'twitch' | 'youtube' | 'kick'; code: string; state: string }
  | { type: 'DO_LOGIN'; platform: 'twitch' | 'youtube' | 'kick'; streamerUsername?: string }
  | { type: 'GET_AUTH_STATUS' }
  | { type: 'GET_CONNECTION_STATE' }
  | { type: 'LOGOUT' }
  | { type: 'STORE_VIEWER_TOKEN'; token: string }
  | { type: 'SAVE_NAME_COLOR'; color: string | null }
  | { type: 'SAVE_NAME_GRADIENT'; gradient: string | null };

export type ExtensionResponse =
  | { success: true; data?: any }
  | { success: false; error: string; data?: any };

/**
 * Storage schemas
 */
export interface LocalStorage {
  viewer_jwt_token?: string;
  viewer_info?: ViewerInfo;
  viewer_name_color?: string;
  viewer_name_gradient?: string; // JSON-serialized NameGradient, e.g. '{"type":"linear","colors":["#9146ff","#00b5ad"],"angle":90}'
  ui_collapsed?: boolean;
}

export interface SyncStorage {
  apiGatewayUrl: string;
  extensionEnabled: boolean;
  preferences: {
    autoDetectEnabled: boolean;
    replaceNativeChat: boolean;
    fontSize: 'small' | 'medium' | 'large';
  };
}

export const DEFAULT_SETTINGS: SyncStorage = {
  apiGatewayUrl: API_BASE_URL,
  extensionEnabled: true,
  preferences: {
    autoDetectEnabled: true,
    replaceNativeChat: true,
    fontSize: 'medium',
  },
};
