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
 * UserAvatar component (extension copy)
 *
 * Composite avatar component that renders:
 * - Base avatar circle (img or initials fallback)
 * - Optional frame centered at 1.4× size (overflow visible)
 * - Optional flair at bottom-right at 0.4× size
 *
 * Mirrors monorepo frontend/src/components/UserAvatar.tsx without Next.js specifics.
 */

import React from 'react';

export interface UserAvatarProps {
  avatarUrl?: string;
  frameUrl?: string;
  flairUrl?: string;
  size: number;
  displayName?: string;
}

export function UserAvatar({ avatarUrl, frameUrl, flairUrl, size, displayName }: UserAvatarProps) {
  const frameSize = Math.round(size * 1.4);
  const flairSize = Math.round(size * 0.4);
  const initials = displayName ? displayName.charAt(0).toUpperCase() : '?';

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        overflow: 'visible',
        flexShrink: 0,
      }}
    >
      {/* Base avatar */}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName ?? 'Avatar'}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            backgroundColor: 'var(--color-surface-2, #333)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.round(size * 0.4),
            color: 'var(--color-text-sub, #aaa)',
            fontWeight: 500,
          }}
          aria-label={displayName ?? 'Avatar'}
        >
          {initials}
        </div>
      )}

      {/* Frame — centered, 1.4× size, overflows container */}
      {frameUrl && (
        <img
          src={frameUrl}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: frameSize,
            height: frameSize,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}

      {/* Flair — bottom-right corner, 0.4× size */}
      {flairUrl && (
        <img
          src={flairUrl}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: flairSize,
            height: flairSize,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
}
