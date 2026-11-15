/**
 * @module
 * Products domain — the rules, importable without the module's HTTP surface.
 * See `docs/understand/domain-layer.md`.
 */

export { productActions, NO_PRODUCT_ACTIONS, NO_PRODUCT_STANDING } from './actions';
export type { ProductStanding } from './actions';

export { availableStock, stockFlags } from './stock';

export { isPreorder, latestReleaseDate } from './preorder';
export { isBackorder } from './backorder';
export { isBuyable, becameBuyable } from './buyable';
export type { BuyableFacts } from './buyable';
export type { BackorderFacts } from './backorder';
export type { PreorderFacts } from './preorder';
