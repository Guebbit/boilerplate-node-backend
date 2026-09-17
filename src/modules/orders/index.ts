/**
 * @module
 * Orders — public barrel, the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `orderRepository` and the model's runtime stay
 * inside — `cart`'s checkout composes its own transaction from `orderService.createRaw`,
 * `freezeOrderLines`, `allocateInvoiceNumber` and `retractOrder`, the same granular pieces
 * `create` itself is built from, never the collection directly. This module's own reach INTO
 * `users` — `USER_DELETED`, `userService.getById` — is `module.ts`'s business, not this barrel's.
 */

export * from './services';

export * from './domain';

export * from './events';

export * from './emails';

export type * from './model';
