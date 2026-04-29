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
 * Chrome Storage API wrapper for extension settings and tokens
 */

import { LocalStorage, SyncStorage, DEFAULT_SETTINGS } from './types/extension';

// Re-export DEFAULT_SETTINGS
export { DEFAULT_SETTINGS };

/**
 * Get all sync storage (settings)
 * Includes migration logic for legacy extensionEnabled -> platformEnabled schema change.
 */
export async function getSyncStorage(): Promise<SyncStorage> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[AllChat Storage] chrome.storage.sync.get timed out, resolving defaults');
      resolve({ ...DEFAULT_SETTINGS } as SyncStorage);
    }, 5000);

    chrome.storage.sync.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>, (items) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        console.warn('[AllChat Storage] chrome.storage.sync.get error:', chrome.runtime.lastError.message);
        resolve({ ...DEFAULT_SETTINGS } as SyncStorage);
        return;
      }
      const result = items as unknown as SyncStorage & { extensionEnabled?: boolean };

      // Migration: legacy extensionEnabled -> platformEnabled
      if (!result.platformEnabled) {
        const legacyEnabled = result.extensionEnabled ?? true;
        result.platformEnabled = {
          twitch: legacyEnabled,
          youtube: legacyEnabled,
          youtubeStudio: legacyEnabled,
          kick: legacyEnabled,
        };
        // Persist migration (fire-and-forget)
        chrome.storage.sync.set({ platformEnabled: result.platformEnabled });
      } else {
        // Deep-merge: chrome.storage.sync.get only shallow-merges nested objects.
        // If user stored { twitch: false } without youtube/kick keys, fill in defaults.
        result.platformEnabled = {
          twitch: result.platformEnabled.twitch ?? true,
          youtube: result.platformEnabled.youtube ?? true,
          youtubeStudio: result.platformEnabled.youtubeStudio ?? true,
          kick: result.platformEnabled.kick ?? true,
        };
      }

      // Remove legacy key from returned object
      delete (result as any).extensionEnabled;
      // Also remove from storage if it still exists (fire-and-forget)
      if ((items as any).extensionEnabled !== undefined) {
        chrome.storage.sync.remove('extensionEnabled');
      }

      resolve(result as SyncStorage);
    });
  });
}

/**
 * Set sync storage (settings)
 */
export async function setSyncStorage(data: Partial<SyncStorage>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(data, () => resolve());
  });
}

/**
 * Get all local storage (tokens, viewer info)
 */
export async function getLocalStorage(): Promise<LocalStorage> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[AllChat Storage] chrome.storage.local.get timed out, resolving empty');
      resolve({} as LocalStorage);
    }, 5000);

    chrome.storage.local.get(null, (items) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        console.warn('[AllChat Storage] chrome.storage.local.get error:', chrome.runtime.lastError.message);
        resolve({} as LocalStorage);
        return;
      }
      resolve(items as LocalStorage);
    });
  });
}

/**
 * Set local storage (tokens, viewer info)
 */
export async function setLocalStorage(data: Partial<LocalStorage>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => resolve());
  });
}

/**
 * Get API Gateway URL from settings.
 * Falls back to DEFAULT_SETTINGS if stored value is a localhost URL
 * (guards against stale values from development installs).
 */
export async function getApiGatewayUrl(): Promise<string> {
  const settings = await getSyncStorage();
  const url = settings.apiGatewayUrl;
  if (!url || url.includes('localhost') || url.includes('127.0.0.1')) {
    console.warn('[AllChat Storage] Stale localhost API URL detected, using default:', DEFAULT_SETTINGS.apiGatewayUrl);
    await setSyncStorage({ apiGatewayUrl: DEFAULT_SETTINGS.apiGatewayUrl });
    return DEFAULT_SETTINGS.apiGatewayUrl;
  }
  console.log('[AllChat Storage] API Gateway URL:', url);
  return url;
}

/**
 * Get viewer JWT token
 */
export async function getViewerToken(): Promise<string | null> {
  const storage = await getLocalStorage();
  return storage.viewer_jwt_token || null;
}

/**
 * Clear viewer authentication (logout)
 */
export async function clearViewerAuth(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['viewer_jwt_token', 'viewer_info', 'viewer_name_color'], () => resolve());
  });
}

/**
 * Get viewer name color
 */
export async function getNameColor(): Promise<string | null> {
  const storage = await getLocalStorage();
  return storage.viewer_name_color || null;
}

/**
 * Get viewer name gradient (JSON-serialized NameGradient string)
 */
export async function getNameGradient(): Promise<string | null> {
  const storage = await getLocalStorage();
  return storage.viewer_name_gradient ?? null;
}

/**
 * Set or clear viewer name gradient
 */
export async function setNameGradient(gradient: string | null): Promise<void> {
  if (gradient === null) {
    await setLocalStorage({ viewer_name_gradient: undefined });
  } else {
    await setLocalStorage({ viewer_name_gradient: gradient });
  }
}
