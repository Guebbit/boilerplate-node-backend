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
 * `cartRepository` is deliberately absent, and `tests/cross-cutting/published-repositories.test.ts`
 * is what keeps it out: publishing a repository hands every sibling a write on this collection with
 * the service — and the rules it carries — bypassed, and no production caller ever wanted one. The
 * single reader was a SPEC in `products`, checking what a deletion did to a cart; it asks
 * `cartService.cartGet` for that now, which answers the same question through the door everyone
 * else uses.
 *
 * The model and its document type stay inside: nothing embeds a cart, so nobody needs its shape.
 */
export { cartService } from './services';
