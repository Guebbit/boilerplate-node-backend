/**
 * @module
 * Cart — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 */

// `cartRepository` and the model stay inside: publishing a repository would let a sibling bypass
// the service's rules, and nothing embeds a cart, so nobody needs its shape.
export { cartService } from './services';
