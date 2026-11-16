/**
 * @module
 * Cart — public barrel; the only surface a sibling module may import (see
 * `docs/understand/strategic-ddd.md` §5 for the rule). `cartRepository` and the model's runtime stay
 * inside: publishing either would let a sibling bypass the service's rules.
 *
 * @see docs/modules/cart.md#its-neighbourhood
 */

export * from './services';

export * from './events';

export * from './domain';

export type * from './model';

export type * from './presenter';
