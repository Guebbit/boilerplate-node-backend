/**
 * @module
 * Products domain — the rules, importable without the module's HTTP surface.
 *
 * @see docs/understand/domain-layer.md#_1-the-folder
 */

export { productActions, NO_PRODUCT_ACTIONS, NO_PRODUCT_STANDING } from './actions';
export type { ProductStanding } from './actions';

export { availableStock } from './stock';

export { isPreorder, latestReleaseDate } from './preorder';
export { isBackorder } from './backorder';
export { availabilityOf } from './availability';
export type {
    Availability,
    AvailabilityCounts,
    AvailabilityTerms,
    AvailabilityFacts
} from './availability';
export type { BackorderFacts } from './backorder';
export type { PreorderFacts } from './preorder';
