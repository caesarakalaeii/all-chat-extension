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
}

export interface SendMessageResponse {
  success: boolean;
  message: string;
  error?: string;
  details?: string;
  reset_time?: number;
}
