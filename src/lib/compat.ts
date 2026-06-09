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

// Anti-fork check.
//
// All-Chat is AGPL-licensed: anyone may redistribute it, but the sign-in flow
// is only enabled in the official build. If the extension has been re-published
// under a different name or add-on ID, or with the AGPL license file stripped
// out, we treat it as an unofficial copy: sign-in is disabled and the user is
// pointed at the official extension. This is deliberately written as plain,
// readable code.

export interface CompatResult {
  /** Headline shown to the user, e.g. "This is an unofficial copy. …" */
  label: string;
  /** Link to the official extension. */
  href: string;
  /** Why sign-in is disabled. */
  detail: string;
  /** What the user should do next. */
  action: string;
}

const OFFICIAL_NAME = 'All-Chat Extension';
const OFFICIAL_GECKO_ID = 'allchat@allch.at';
const AGPL_LICENSE_HEADER = 'GNU AFFERO GENERAL PUBLIC LICENSE';

const UNOFFICIAL_COPY: CompatResult = {
  label: 'This is an unofficial copy. Get the official All-Chat extension at',
  href: 'https://allch.at',
  detail: 'Sign-in is disabled for your security.',
  action: 'Please install the official extension to continue.',
};

interface GeckoSettings {
  gecko?: { id?: string };
}

/**
 * Returns a notice describing the problem when running an unofficial copy, or
 * `null` when this is the genuine, unmodified extension.
 */
export async function resolveEnv(): Promise<CompatResult | null> {
  try {
    const runtime = chrome?.runtime;
    const manifest = runtime?.getManifest?.();
    if (!manifest) return null;

    const geckoId = (manifest.browser_specific_settings as GeckoSettings | undefined)?.gecko?.id;
    const nameMatches = manifest.name === OFFICIAL_NAME;
    const idMatches = !geckoId || geckoId === OFFICIAL_GECKO_ID;
    if (!nameMatches || !idMatches) return UNOFFICIAL_COPY;

    // The AGPL requires the license to travel with the code. Confirm it ships
    // and hasn't been replaced.
    const response = await fetch(runtime.getURL('LICENSE'));
    if (!response.ok) return UNOFFICIAL_COPY;
    const license = await response.text();
    if (!license.includes(AGPL_LICENSE_HEADER)) return UNOFFICIAL_COPY;

    return null;
  } catch {
    return null;
  }
}
