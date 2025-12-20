/**
 * Extension-specific types for communication between components
 */

export interface StreamerInfo {
  username: string;
  display_name: string;
  platforms: PlatformInfo[];
  overlay_id: string;
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
  | { type: 'CONNECT_WEBSOCKET'; overlayId: string }
  | { type: 'DISCONNECT_WEBSOCKET' }
  | { type: 'SEND_CHAT_MESSAGE'; streamerUsername: string; message: string }
  | { type: 'START_AUTH'; platform: 'twitch' | 'youtube'; streamerUsername?: string }
  | { type: 'GET_AUTH_STATUS' }
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
  apiGatewayUrl: 'http://localhost:8080',
  preferences: {
    autoDetectEnabled: true,
    replaceNativeChat: true,
    fontSize: 'medium',
  },
};
