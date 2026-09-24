/**
 * @module
 * Delivery domain — the rules, importable without the module's HTTP surface.
 * See `docs/theory/domain-layer.md`.
 */

export {
    SHIPPING_METHODS,
    findShippingMethod,
    priceShipping,
    methodFitsWeight,
    methodsForWeight
} from './rates';
