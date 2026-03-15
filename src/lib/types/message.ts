/**
 * Chat Message Types
 *
 * These types match the unified message format from the Message Processor.
 * Used for WebSocket messages and chat rendering.
 */

export interface ChatMessage {
  id: string;
  overlay_id: string;
  platform: 'twitch' | 'youtube' | 'kick' | 'tiktok';
  channel_id: string;
  channel_name: string;
  user: UserInfo;
  message: MessageInfo;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface UserInfo {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  badges: Badge[];
  color?: string;
  name_gradient?: string;        // Phase 29: raw JSON string e.g. {"type":"linear","colors":[...],"angle":90}
  avatar_frame_url?: string;     // Phase 30: URL of selected avatar frame
  avatar_flair_url?: string;     // Phase 30: URL of selected avatar flair
}

export interface Badge {
  name: string;
  version: string;
  icon_url: string;
}

export interface MessageInfo {
  text: string;
  emotes: Emote[];
}

export interface Emote {
  code: string;
  provider: 'twitch' | '7tv' | 'bttv' | 'ffz';
  url: string;
  positions: number[][];
}

export interface WebSocketMessage {
  type: 'chat_message' | 'ping' | 'pong' | 'error' | 'connected';
  data?: ChatMessage | { overlay_id: string };
  timestamp?: string;
  error?: string;
}
