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
 * Autocomplete Component
 *
 * Displays emote suggestions as user types
 */

import React, { useRef, useEffect } from 'react';
import type { EmoteData } from '../../lib/emoteAutocomplete';

interface AutocompleteProps {
  suggestions: EmoteData[];
  selectedIndex: number;
  onSelect: (emote: EmoteData) => void;
  onClose: () => void;
  inputElement?: HTMLInputElement | null;
}

export default function Autocomplete({
  suggestions,
  selectedIndex,
  onSelect,
  onClose,
  inputElement
}: AutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current && containerRef.current) {
      const container = containerRef.current;
      const item = selectedItemRef.current;

      const containerRect = container.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();

      if (itemRect.bottom > containerRect.bottom) {
        item.scrollIntoView({ block: 'nearest' });
      } else if (itemRect.top < containerRect.top) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        inputElement &&
        !inputElement.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, inputElement]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-surface border border-border rounded shadow-xs max-h-48 overflow-y-auto"
      style={{ zIndex: 1000 }}
    >
      {suggestions.map((emote, index) => (
        <div
          key={emote.id}
          ref={index === selectedIndex ? selectedItemRef : null}
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
            index === selectedIndex
              ? 'bg-purple-600 text-text'
              : 'text-text hover:bg-surface-2'
          }`}
          onClick={() => onSelect(emote)}
        >
          <img
            src={emote.url}
            alt={emote.name}
            className="w-6 h-6 object-contain"
            onError={(e) => {
              // Hide image if it fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="text-sm font-medium">{emote.name}</span>
          <span className="text-xs text-[var(--color-text-sub)] ml-auto">{emote.provider}</span>
        </div>
      ))}
    </div>
  );
}
