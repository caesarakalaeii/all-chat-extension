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

import React from 'react';
import type { ChatMessage } from './types/message';
import type { EmoteData } from './emoteAutocomplete';

type PositionedEmote = {
  start: number;
  end: number;
  url?: string;
  code: string;
  provider: string;
  key: string;
};

/**
 * Local emote lookup keyed by the exact (case-sensitive) emote code, used as a
 * client-side fallback when the backend enricher returns no emotes (cold cache,
 * TTL expiry, provider timeout). Populated from the same provider data the
 * autocomplete uses — see `fetchAllEmotes` in `emoteAutocomplete.ts`.
 */
export type EmoteLookup = Map<string, EmoteData>;

/**
 * Build a code-keyed lookup from the flat emote list returned by
 * `fetchAllEmotes`. Emote codes are case-sensitive (e.g. `Kappa` ≠ `kappa`),
 * matching the backend's exact-token matching.
 */
export function buildEmoteLookup(emotes: EmoteData[]): EmoteLookup {
  const lookup: EmoteLookup = new Map();
  for (const emote of emotes) {
    if (!lookup.has(emote.name)) {
      lookup.set(emote.name, emote);
    }
  }
  return lookup;
}

/**
 * Tokenize message text on whitespace and match each token against the local
 * emote lookup, producing the same positioned-emote shape the backend path
 * yields. Positions use an inclusive `end` to match the backend convention.
 */
function buildFallbackPositions(text: string, emoteMap: EmoteLookup): PositionedEmote[] {
  const positioned: PositionedEmote[] = [];
  const tokenPattern = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    const emote = emoteMap.get(match[0]);
    if (!emote) {
      continue;
    }

    const start = match.index;
    const end = start + match[0].length - 1;
    positioned.push({
      start,
      end,
      url: emote.url,
      code: emote.name,
      provider: emote.provider,
      key: `fallback-${emote.name}-${start}`,
    });
  }

  return positioned;
}

export function renderMessageContent(
  message: ChatMessage,
  emoteMap?: EmoteLookup,
): React.ReactNode {
  const text = message.message?.text ?? '';
  const emotes = message.message?.emotes ?? [];

  if (!text) {
    return text;
  }

  let positioned: PositionedEmote[] = [];

  if (emotes.length > 0) {
    emotes.forEach((emote, emoteIndex) => {
      if (!emote.positions || emote.positions.length === 0) {
        return;
      }

      emote.positions.forEach((pos, occurrenceIndex) => {
        if (!Array.isArray(pos) || pos.length !== 2) {
          return;
        }

        const [start, end] = pos;
        if (typeof start !== 'number' || typeof end !== 'number') {
          return;
        }

        positioned.push({
          start,
          end,
          url: emote.url,
          code: emote.code,
          provider: emote.provider,
          key: `${emote.code}-${emoteIndex}-${occurrenceIndex}-${start}`,
        });
      });
    });
  } else if (emoteMap && emoteMap.size > 0) {
    // Backend enricher returned no emotes — fall back to the locally cached map.
    positioned = buildFallbackPositions(text, emoteMap);
  }

  if (positioned.length === 0) {
    return text;
  }

  positioned.sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  positioned.forEach((emote, index) => {
    if (
      emote.start < cursor ||
      emote.start >= text.length ||
      emote.end >= text.length
    ) {
      return;
    }

    if (emote.start > cursor) {
      nodes.push(
        <span key={`text-${index}-${cursor}`}>
          {text.slice(cursor, emote.start)}
        </span>,
      );
    }

    if (!emote.url) {
      nodes.push(
        <span key={`${emote.key}-text`} className="mx-0.5">
          {text.slice(emote.start, emote.end + 1)}
        </span>,
      );
    } else {
      nodes.push(
        <img
          key={emote.key}
          src={emote.url}
          alt={emote.code}
          title={`${emote.code} (${emote.provider})`}
          className="inline-block h-[1.4em] w-auto align-text-bottom mx-0.5"
        />,
      );
    }

    cursor = emote.end + 1;
  });

  if (cursor < text.length) {
    nodes.push(
      <span key={`text-tail-${cursor}`}>
        {text.slice(cursor)}
      </span>,
    );
  }

  return nodes;
}
