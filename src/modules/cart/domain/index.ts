/**
 * @module
 * Cart — domain layer. Pure rules, lint-guaranteed framework-free.
 *
 * @see docs/understand/domain-layer.md#the-rule-enforced-by-lint
 */

export {
    evaluateCheckout,
    basketWeight,
    needsShipping,
    evaluateShippingRequirement
} from './rules';

export { planMergeLine } from './merge';

export { fitsStock, clampToStock, unitsShippingLater } from './stock';
export type { ShipsLaterFacts, StockClamp, StockWarningCode } from './stock';

export { lineAvailability, isBuyable } from './availability';

export type { AvailabilityFacts, AvailabilityProduct, LineAvailability } from './availability';

export type { MergeLineFacts, MergePlan } from './merge';

export type {
    CheckoutShortfall,
    CheckoutVerdict,
    UnavailableCartLine,
    ShippingRequirementVerdict
} from './rules';
