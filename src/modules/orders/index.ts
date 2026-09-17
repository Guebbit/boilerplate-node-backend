/**
 * @module
 * Orders — public barrel, the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `orderRepository` and the model's runtime stay
 * inside — `cart`'s checkout composes its own transaction from `orderService.createRaw`,
 * `freezeOrderLines`, `allocateInvoiceNumber` and `retractOrder`, the same granular pieces
 * `create` itself is built from, never the collection directly. `users` is reached for exactly
 * `USER_DELETED` below, not for resolving a live account.
 */

export * from './services';

export * from './domain';

export * from './events';

export * from './emails';

/** A fixture order for a sibling's own tests. */
export { makeOrder } from './factories';
export type { OrderOverrides, OrderFixture, OrderSnapshotInput, OrderLineInput } from './factories';

export type * from './model';
