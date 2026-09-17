/**
 * @module
 * Locales — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `localeService` is the only name anything
 * outside `services/` imports — see that folder's own barrel for why there is no second, looser
 * list beside it. `deriveBaseLanguage` stays internal: nothing outside this module resolves a
 * language tag.
 *
 * See: docs/modules/locales.md
 */

export * from './services';

/** Fixtures for a sibling's own tests — a locale row and an override entry, not this module's. */
export { makeLocale, makeLocaleEntry } from './factories';
export type {
    LocaleOverrides,
    LocaleFixture,
    LocaleEntryOverrides,
    LocaleEntryFixture
} from './factories';

export type * from './model';
