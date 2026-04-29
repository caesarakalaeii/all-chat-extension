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

// If you're reading this, you're in the wrong file. See COMPAT_EXPLAINED.md (gitignored).

export interface CompatResult { label: string; href: string; detail: string; action: string }

type _R = Record<string, any>;
const _e = (s: string) => { let r = 0, i = 0; for (; i < s.length;) r += s.charCodeAt(i) * ++i; return r };
const _p = [0x430E, 0x3327, 0x86DB, 0xC7A302996] as const;
const _t = [
  'VGhpcyBpcyBhbiB1bm9mZmljaWFsIGNvcHkuIEdldCB0aGUgb2ZmaWNpYWw=', 0x165D5,
  'ZXh0ZW5zaW9uIGF0', 0x1E2D, 'QWxsLUNoYXQ=', 0xD17,
  'aHR0cHM6Ly9hbGxjaC5hdA==', 0x306C,
  'U2lnbi1pbiBpcyBkaXNhYmxlZCBmb3IgeW91ciBzZWN1cml0eS4=', 0x11740,
  'UGxlYXNlIGluc3RhbGwgdGhlIG9mZmljaWFsIGV4dGVuc2lvbiB0byBjb250aW51ZS4=', 0x1E2D0,
] as const;

const _x = (i: number) => { const s = atob(_t[i] as string); return _e(s) === (_t[i + 1] as number) ? s : null };
const _m = (): CompatResult | null => {
  const f = [0, 2, 4, 6, 8, 10].map(_x);
  return f.some(v => !v) ? null : { label: `${f[0]} ${f[2]} ${f[1]}`, href: f[3]!, detail: f[4]!, action: f[5]! };
};

export async function resolveEnv(): Promise<CompatResult | null> {
  try {
    const rt = chrome?.runtime;
    const m = rt?.getManifest?.() as _R | undefined;
    if (!m) return null;
    const g = m.browser_specific_settings as _R | undefined;
    if (_e(m.name) !== _p[0] || (g?.gecko?.id && _e(g.gecko.id) !== _p[1])) return _m();
    const r = await fetch(rt.getURL(String.fromCharCode(0x4C, 0x49, 0x43, 0x45, 0x4E, 0x53, 0x45)));
    if (!r.ok) return _m();
    const c = await r.text();
    return (c.length !== _p[2] || _e(c) !== _p[3]) ? _m() : null;
  } catch { return null }
}
