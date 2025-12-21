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
  platform: 'twitch' | 'youtube';
}

/**
 * Messages between content script and service worker
 */
export type ExtensionMessage =
  | { type: 'GET_STREAMER_INFO'; username: string }
  | { type: 'CONNECT_WEBSOCKET'; streamerUsername: string }
  | { type: 'DISCONNECT_WEBSOCKET' }
  | { type: 'SEND_CHAT_MESSAGE'; streamerUsername: string; message: string }
  | { type: 'START_AUTH'; platform: 'twitch' | 'youtube'; streamerUsername?: string }
  | { type: 'GET_AUTH_STATUS' }
  | { type: 'GET_CONNECTION_STATE' }
  | { type: 'LOGOUT' }
  | { type: 'STORE_VIEWER_TOKEN'; token: string };

export type ExtensionResponse =
  | { success: true; data?: any }
  | { success: false; error: string; data?: any };

/**
 * Storage schemas
 */
export interface LocalStorage {
  viewer_jwt_token?: string;
  viewer_info?: ViewerInfo;
  ui_collapsed?: boolean;
}

export interface SyncStorage {
  apiGatewayUrl: string;
  preferences: {
    autoDetectEnabled: boolean;
    replaceNativeChat: boolean;
    fontSize: 'small' | 'medium' | 'large';
  };
}

export const DEFAULT_SETTINGS: SyncStorage = {
  apiGatewayUrl: API_BASE_URL,
  preferences: {
    autoDetectEnabled: true,
    replaceNativeChat: true,
    fontSize: 'medium',
  },
};
