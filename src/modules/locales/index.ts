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

export type * from './model';
