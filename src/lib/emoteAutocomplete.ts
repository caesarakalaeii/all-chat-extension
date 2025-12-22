/**
 * 7TV Emote Autocomplete Service
 * 
 * Fetches and manages 7TV emotes for autocomplete functionality
 */

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

// Cache for emotes to avoid excessive API calls
const emoteCache = new Map<string, EmoteData[]>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

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
      const response = await fetch(`https://7tv.io/v3/users/twitch/${channelName}`);
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
    const response = await fetch('https://7tv.io/v3/emote-sets/global');
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
    const baseUrl = emote.data?.host?.url || 'https://cdn.7tv.app/emote';
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
