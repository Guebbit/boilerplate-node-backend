/**
 * @module
 * Orders — public barrel; the only surface a sibling module may import. `orderRepository` and the
 * model's runtime stay inside — `orderService.placeOrder` is the one function that writes a new order; `@modules/cart`'s checkout
 * and this module's own `create` both call it, never the collection directly. This module's own
 * reach INTO `users` — the `personalData.erase` hook, `userService.getById` — is `module.ts`'s
 * business, not this barrel's.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';

export * from './domain';

export * from './events';

export * from './emails';

export type * from './model';
