/**
 * @module
 * Addresses — public barrel; the only surface a sibling module may import (the rule
 * is linked below).
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 * @see docs/modules/addresses.md#its-neighbourhood
 */

export * from './service';

export type * from './model';

export type * from './presenter';
