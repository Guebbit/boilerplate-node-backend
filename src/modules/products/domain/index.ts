/**
 * @module
 * Products domain — the rules, importable without the module's HTTP surface.
 * See `docs/theory/domain-layer.md`.
 */

export { availableStock, stockFlags } from './stock';

export { isPreorder, latestReleaseDate } from './preorder';
export type { PreorderFacts } from './preorder';
