import { ChatMessage } from './message';

/**
 * postMessage types for pop-out communication between iframe and content script.
 * Content script ↔ iframe use window.postMessage; pop-out ↔ SW use chrome.runtime.Port.
 */

/** iframe → content script: user clicked pop-out button */
export interface PopoutRequestMessage {
  type: 'POPOUT_REQUEST';
  platform: string;
  streamer: string;
  displayName: string;
  twitchChannel?: string;
  messages: ChatMessage[];
}

/** content script → iframe: pop-out window successfully opened */
export interface PopoutOpenedMessage {
  type: 'POPOUT_OPENED';
}

/** content script → iframe: pop-out window was closed */
export interface PopoutClosedMessage {
  type: 'POPOUT_CLOSED';
}

/** iframe → content script: user clicked "Switch to native" in in-page mode */
export interface SwitchToNativeMessage {
  type: 'SWITCH_TO_NATIVE';
}

/** iframe → content script: user clicked "Bring back chat" to close pop-out */
export interface ClosePopoutMessage {
  type: 'CLOSE_POPOUT';
}

/** native chat DOM → content script: user clicked "Switch to AllChat" button */
export interface SwitchToAllChatMessage {
  type: 'SWITCH_TO_ALLCHAT';
  platform: string;
  streamer: string;
}

export type PopoutMessage =
  | PopoutRequestMessage
  | PopoutOpenedMessage
  | PopoutClosedMessage
  | ClosePopoutMessage
  | SwitchToNativeMessage
  | SwitchToAllChatMessage;

/** Default pop-out window dimensions (before any persisted size) per UI-SPEC */
export const POPOUT_DEFAULTS = {
  width: 420,
  height: 700,
  x: 100,
  y: 100,
} as const;

/** chrome.storage.local key for temporary message buffer during pop-out handoff */
export const POPOUT_MESSAGE_BUFFER_KEY = 'popout_message_buffer';

/** Maximum messages to transfer to pop-out window (matches in-memory cap) */
export const POPOUT_MAX_MESSAGES = 50;

/** Poll interval (ms) for detecting pop-out window close */
export const POPOUT_CLOSE_POLL_MS = 500;

/** Port name for pop-out ↔ service worker long-lived connection */
export const POPOUT_PORT_NAME = 'allchat-popout';
