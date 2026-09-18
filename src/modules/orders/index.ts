/**
 * @module
 * Orders — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `orderRepository` and the model's runtime stay
 * inside — `placeOrder` is the one function that writes a new order; `@modules/cart`'s checkout
 * and this module's own `create` both call it, never the collection directly. This module's own
 * reach INTO `users` — `USER_DELETED`, `userService.getById` — is `module.ts`'s business, not this
 * barrel's.
 *
 * See: docs/modules/orders.md
 */

export * from './services';

export * from './domain';

export * from './events';

export * from './emails';

export type * from './model';
