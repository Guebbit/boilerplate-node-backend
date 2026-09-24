/**
 * @module
 * Locale factories that touch the test database. The BUILDER lives one level up in
 * `../factories.ts`; this file only persists what it returns.
 */

import { localeRepository } from '../repository';
import { makeLocale } from '../factories';
import type { LocaleDocument } from '../model';

/**
 * Persist a locale by BCP-47 tag, with `name`/`nativeName` also set to the tag — the shorthand
 * every locale-scoped test reaches for when the display name itself is never under test.
 * @param overrides - fields beyond the tag, `active` above all — a test proving a disabled
 *   locale is skipped needs one that exists but isn't active
 */
export const givenLocale = (
    tag: string,
    overrides: { active?: boolean } = {}
): Promise<LocaleDocument> =>
    localeRepository.create(makeLocale({ tag, name: tag, nativeName: tag, ...overrides }));
