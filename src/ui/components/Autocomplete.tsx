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
      className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto"
      style={{ zIndex: 1000 }}
    >
      {suggestions.map((emote, index) => (
        <div
          key={emote.id}
          ref={index === selectedIndex ? selectedItemRef : null}
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
            index === selectedIndex
              ? 'bg-purple-600 text-white'
              : 'text-gray-200 hover:bg-gray-700'
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
          <span className="text-xs text-gray-400 ml-auto">{emote.provider}</span>
        </div>
      ))}
    </div>
  );
}
