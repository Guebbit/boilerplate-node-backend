/**
 * @module
 * Cart — domain layer. Pure rules, lint-guaranteed framework-free.
 * See `docs/theory/domain-layer.md`.
 */

export {
    evaluateCheckout,
    basketWeight,
    needsShipping,
    evaluateShippingRequirement
} from './rules';

export type { CheckoutShortfall, UnavailableCartLine, ShippingRequirementVerdict } from './rules';
