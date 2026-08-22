/**
 * Cart — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 */

/*
 * `wishlist` calls the service to move a saved line into the cart; `products` and `users` reach the
 * repository to clear carts when their own rows disappear. The model and its document type stay
 * inside: nothing embeds a cart, so nobody needs its shape.
 */
export { cartService } from './services';
export { cartRepository } from './repository';
