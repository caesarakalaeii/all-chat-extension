/**
 * Multi-Provider Emote Autocomplete Service
 * 
 * Fetches and manages emotes from 7TV, BTTV, FFZ, and Twitch for autocomplete functionality
 */

// API constants
const SEVEN_TV_API_BASE = 'https://7tv.io/v3';
const SEVEN_TV_CDN_BASE = 'https://cdn.7tv.app/emote';
const BTTV_API_BASE = 'https://api.betterttv.net/3/cached';
const FFZ_API_BASE = 'https://api.frankerfacez.com/v1';

export interface EmoteData {
  id: string;
  name: string;
  url: string;
  provider: '7tv' | 'bttv' | 'ffz' | 'twitch';
}

interface SevenTVEmote {
  id: string;
  name: string;
  data?: {
    host?: {
      url?: string;
      files?: Array<{ name: string; }>;
    };
  };
}

interface SevenTVUser {
  emote_set?: {
    emotes?: SevenTVEmote[];
  };
}

// BTTV API types
interface BTTVEmote {
  id: string;
  code: string;
  imageType: string;
  userId?: string;
}

interface BTTVChannelResponse {
  channelEmotes: BTTVEmote[];
  sharedEmotes: BTTVEmote[];
}

// FFZ API types
interface FFZEmote {
  id: number;
  name: string;
  urls: {
    1?: string;
    2?: string;
    4?: string;
  };
}

interface FFZSet {
  emoticons: FFZEmote[];
}

interface FFZRoomResponse {
  sets: {
    [key: string]: FFZSet;
  };
}

interface FFZGlobalResponse {
  sets: {
    [key: string]: FFZSet;
  };
  default_sets: number[];
}

// Cache for emotes to avoid excessive API calls
const emoteCache = new Map<string, EmoteData[]>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Fetch all emotes from all providers for a specific Twitch channel
 */
export async function fetchAllEmotes(channelName: string): Promise<EmoteData[]> {
  const cacheKey = `all:${channelName}`;
  const now = Date.now();
  
  // Check cache
  if (emoteCache.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey) || 0;
    if (now - timestamp < CACHE_DURATION) {
      return emoteCache.get(cacheKey) || [];
    }
  }

  try {
    // Fetch emotes from all providers in parallel
    const [sevenTVEmotes, bttvEmotes, ffzEmotes] = await Promise.all([
      fetch7TVEmotes(channelName),
      fetchBTTVEmotes(channelName),
      fetchFFZEmotes(channelName),
    ]);

    // Combine all emotes
    const allEmotes = [...sevenTVEmotes, ...bttvEmotes, ...ffzEmotes];
    
    // Update cache
    emoteCache.set(cacheKey, allEmotes);
    cacheTimestamps.set(cacheKey, now);
    
    console.log(`[Emote Autocomplete] Loaded ${allEmotes.length} emotes (7TV: ${sevenTVEmotes.length}, BTTV: ${bttvEmotes.length}, FFZ: ${ffzEmotes.length})`);
    
    return allEmotes;
  } catch (err) {
    console.error('[Emote Autocomplete] Failed to fetch emotes:', err);
    return [];
  }
}

/**
 * Fetch 7TV emotes for a specific Twitch channel
 */
export async function fetch7TVEmotes(channelName: string): Promise<EmoteData[]> {
  const cacheKey = `7tv:${channelName}`;
  const now = Date.now();
  
  // Check cache
  if (emoteCache.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey) || 0;
    if (now - timestamp < CACHE_DURATION) {
      return emoteCache.get(cacheKey) || [];
    }
  }

  try {
    // First, get global emotes
    const globalEmotes = await fetchGlobal7TVEmotes();
    
    // Then try to fetch channel-specific emotes
    let channelEmotes: EmoteData[] = [];
    try {
      // Sanitize channel name for URL
      const encodedChannelName = encodeURIComponent(channelName);
      const response = await fetch(`${SEVEN_TV_API_BASE}/users/twitch/${encodedChannelName}`);
      if (response.ok) {
        const data: SevenTVUser = await response.json();
        channelEmotes = parse7TVEmotes(data.emote_set?.emotes || []);
      }
    } catch (err) {
      console.warn('[7TV] Failed to fetch channel emotes:', err);
    }

    // Combine global and channel emotes
    const allEmotes = [...globalEmotes, ...channelEmotes];
    
    // Update cache
    emoteCache.set(cacheKey, allEmotes);
    cacheTimestamps.set(cacheKey, now);
    
    return allEmotes;
  } catch (err) {
    console.error('[7TV] Failed to fetch emotes:', err);
    return [];
  }
}

/**
 * Fetch global 7TV emotes
 */
async function fetchGlobal7TVEmotes(): Promise<EmoteData[]> {
  const cacheKey = '7tv:global';
  const now = Date.now();
  
  // Check cache
  if (emoteCache.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey) || 0;
    if (now - timestamp < CACHE_DURATION) {
      return emoteCache.get(cacheKey) || [];
    }
  }

  try {
    const response = await fetch(`${SEVEN_TV_API_BASE}/emote-sets/global`);
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    const emotes = parse7TVEmotes(data.emotes || []);
    
    // Update cache
    emoteCache.set(cacheKey, emotes);
    cacheTimestamps.set(cacheKey, now);
    
    return emotes;
  } catch (err) {
    console.error('[7TV] Failed to fetch global emotes:', err);
    return [];
  }
}

/**
 * Parse 7TV API response into EmoteData format
 */
function parse7TVEmotes(emotes: SevenTVEmote[]): EmoteData[] {
  return emotes.map(emote => {
    // Construct emote URL
    const baseUrl = emote.data?.host?.url || SEVEN_TV_CDN_BASE;
    const fileName = emote.data?.host?.files?.[0]?.name || '1x.webp';
    const url = `${baseUrl}/${emote.id}/${fileName}`;
    
    return {
      id: emote.id,
      name: emote.name,
      url: url,
      provider: '7tv' as const,
    };
  });
}

/**
 * Fetch BTTV emotes for a specific Twitch channel
 */
async function fetchBTTVEmotes(channelName: string): Promise<EmoteData[]> {
  const cacheKey = `bttv:${channelName}`;
  const now = Date.now();
  
  // Check cache
  if (emoteCache.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey) || 0;
    if (now - timestamp < CACHE_DURATION) {
      return emoteCache.get(cacheKey) || [];
    }
  }

  try {
    // First, get global emotes
    const globalEmotes = await fetchGlobalBTTVEmotes();
    
    // Then try to fetch channel-specific emotes
    let channelEmotes: EmoteData[] = [];
    try {
      const encodedChannelName = encodeURIComponent(channelName);
      const response = await fetch(`${BTTV_API_BASE}/users/twitch/${encodedChannelName}`);
      if (response.ok) {
        const data: BTTVChannelResponse = await response.json();
        const channelBTTV = parseBTTVEmotes(data.channelEmotes || []);
        const sharedBTTV = parseBTTVEmotes(data.sharedEmotes || []);
        channelEmotes = [...channelBTTV, ...sharedBTTV];
      }
    } catch (err) {
      console.warn('[BTTV] Failed to fetch channel emotes:', err);
    }

    // Combine global and channel emotes
    const allEmotes = [...globalEmotes, ...channelEmotes];
    
    // Update cache
    emoteCache.set(cacheKey, allEmotes);
    cacheTimestamps.set(cacheKey, now);
    
    return allEmotes;
  } catch (err) {
    console.error('[BTTV] Failed to fetch emotes:', err);
    return [];
  }
}

/**
 * Fetch global BTTV emotes
 */
async function fetchGlobalBTTVEmotes(): Promise<EmoteData[]> {
  const cacheKey = 'bttv:global';
  const now = Date.now();
  
  // Check cache
  if (emoteCache.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey) || 0;
    if (now - timestamp < CACHE_DURATION) {
      return emoteCache.get(cacheKey) || [];
    }
  }

  try {
    const response = await fetch(`${BTTV_API_BASE}/emotes/global`);
    if (!response.ok) {
      return [];
    }
    
    const data: BTTVEmote[] = await response.json();
    const emotes = parseBTTVEmotes(data);
    
    // Update cache
    emoteCache.set(cacheKey, emotes);
    cacheTimestamps.set(cacheKey, now);
    
    return emotes;
  } catch (err) {
    console.error('[BTTV] Failed to fetch global emotes:', err);
    return [];
  }
}

/**
 * Parse BTTV API response into EmoteData format
 */
function parseBTTVEmotes(emotes: BTTVEmote[]): EmoteData[] {
  return emotes.map(emote => {
    // BTTV CDN URL format
    const url = `https://cdn.betterttv.net/emote/${emote.id}/1x`;
    
    return {
      id: emote.id,
      name: emote.code,
      url: url,
      provider: 'bttv' as const,
    };
  });
}

/**
 * Fetch FFZ emotes for a specific Twitch channel
 */
async function fetchFFZEmotes(channelName: string): Promise<EmoteData[]> {
  const cacheKey = `ffz:${channelName}`;
  const now = Date.now();
  
  // Check cache
  if (emoteCache.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey) || 0;
    if (now - timestamp < CACHE_DURATION) {
      return emoteCache.get(cacheKey) || [];
    }
  }

  try {
    // First, get global emotes
    const globalEmotes = await fetchGlobalFFZEmotes();
    
    // Then try to fetch channel-specific emotes
    let channelEmotes: EmoteData[] = [];
    try {
      const encodedChannelName = encodeURIComponent(channelName);
      const response = await fetch(`${FFZ_API_BASE}/room/${encodedChannelName}`);
      if (response.ok) {
        const data: FFZRoomResponse = await response.json();
        // FFZ returns sets, we need to extract emotes from all sets
        const allSets = Object.values(data.sets || {});
        channelEmotes = allSets.flatMap(set => parseFFZEmotes(set.emoticons || []));
      }
    } catch (err) {
      console.warn('[FFZ] Failed to fetch channel emotes:', err);
    }

    // Combine global and channel emotes
    const allEmotes = [...globalEmotes, ...channelEmotes];
    
    // Update cache
    emoteCache.set(cacheKey, allEmotes);
    cacheTimestamps.set(cacheKey, now);
    
    return allEmotes;
  } catch (err) {
    console.error('[FFZ] Failed to fetch emotes:', err);
    return [];
  }
}

/**
 * Fetch global FFZ emotes
 */
async function fetchGlobalFFZEmotes(): Promise<EmoteData[]> {
  const cacheKey = 'ffz:global';
  const now = Date.now();
  
  // Check cache
  if (emoteCache.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey) || 0;
    if (now - timestamp < CACHE_DURATION) {
      return emoteCache.get(cacheKey) || [];
    }
  }

  try {
    const response = await fetch(`${FFZ_API_BASE}/set/global`);
    if (!response.ok) {
      return [];
    }
    
    const data: FFZGlobalResponse = await response.json();
    // Get emotes from default sets
    const defaultSetIds = data.default_sets || [];
    const emotes = defaultSetIds.flatMap(setId => {
      const set = data.sets[setId.toString()];
      return set ? parseFFZEmotes(set.emoticons || []) : [];
    });
    
    // Update cache
    emoteCache.set(cacheKey, emotes);
    cacheTimestamps.set(cacheKey, now);
    
    return emotes;
  } catch (err) {
    console.error('[FFZ] Failed to fetch global emotes:', err);
    return [];
  }
}

/**
 * Parse FFZ API response into EmoteData format
 */
function parseFFZEmotes(emotes: FFZEmote[]): EmoteData[] {
  return emotes.map(emote => {
    // FFZ provides multiple resolutions, use 1x for consistency
    const url = emote.urls['1'] || emote.urls['2'] || emote.urls['4'] || '';
    // FFZ URLs are protocol-relative, add https:
    const fullUrl = url.startsWith('//') ? `https:${url}` : url;
    
    return {
      id: emote.id.toString(),
      name: emote.name,
      url: fullUrl,
      provider: 'ffz' as const,
    };
  });
}

/**
 * Filter emotes by search query
 */
export function filterEmotes(emotes: EmoteData[], query: string, limit: number = 10): EmoteData[] {
  if (!query) return [];
  
  const lowerQuery = query.toLowerCase();
  
  // Find emotes that match the query
  const matches = emotes.filter(emote => 
    emote.name.toLowerCase().startsWith(lowerQuery)
  );
  
  // Sort by name length (shorter names first, as they're more likely to be what user wants)
  matches.sort((a, b) => a.name.length - b.name.length);
  
  return matches.slice(0, limit);
}

/**
 * Clear emote cache (useful for testing or manual refresh)
 */
export function clearEmoteCache(): void {
  emoteCache.clear();
  cacheTimestamps.clear();
}
