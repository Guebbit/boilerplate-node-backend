/**
 * Cart — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 */

export { cartService } from './services';
export { cartRepository } from './repository';
export { cartModel } from './model';
export type { CartDocument } from './model';
