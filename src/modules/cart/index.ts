/**
 * @module
 * Cart — public barrel; the only surface a sibling module may import (the rule
 * is linked below). `cartRepository` and the model's runtime stay
 * inside: publishing either would let a sibling bypass the service's rules.
 *
 * @see docs/modules/cart.md#its-neighbourhood
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';

export * from './events';

export * from './domain';

export type * from './model';

export type * from './presenter';
