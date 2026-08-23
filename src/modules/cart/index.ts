/**
 * Cart — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 */

/*
 * `wishlist` calls the service to move a saved line into the cart — and, through it, inherits the
 * rule about which products may be in one, which is why that check lives in `services/items.ts`
 * rather than in a route.
 *
 * `cartRepository` is published for a sibling's SPEC — `products` reads a cart back to check what
 * a deletion did to it. Nothing in production reaches it: the cleanup those deletions trigger is
 * this module's own, subscribed in `module.ts`.
 *
 * The model and its document type stay inside: nothing embeds a cart, so nobody needs its shape.
 */
export { cartService } from './services';
export { cartRepository } from './repository';
