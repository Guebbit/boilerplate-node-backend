/**
 * Delivery domain — the rules, importable without the module's HTTP surface.
 */

export { SHIPPING_METHODS, findShippingMethod, priceShipping } from './rates';
export type { ShippingMethod } from './rates';
