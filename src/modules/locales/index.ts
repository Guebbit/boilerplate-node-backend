/**
 * @module
 * Locales — public barrel; the only surface a sibling module may import (the rule
 * is linked below). `localeService` is the only name anything
 * outside `services/` imports — see that folder's own barrel for why there is no second, looser
 * list beside it. `deriveBaseLanguage` stays internal: nothing outside this module resolves a
 * language tag.
 *
 * @see docs/modules/locales.md#its-neighbourhood
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';

export type * from './model';
