/**
 * @module
 * Cart — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `cartRepository` and the model's runtime stay
 * inside: publishing either would let a sibling bypass the service's rules.
 *
 * See: docs/modules/cart.md
 */

export * from './services';

export * from './domain';

export type * from './model';
