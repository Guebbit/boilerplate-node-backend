/**
 * Delivery — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 *
 * The domain rules are the load-bearing export: the cart's checkout prices the chosen method
 * through `findShippingMethod`/`priceShipping`, so the number an order freezes and the number
 * this module's `/methods` endpoint quotes can never disagree.
 */

export { SHIPPING_METHODS, findShippingMethod, priceShipping } from './domain';
export type { ShippingMethod } from './domain';
export { shipmentRepository } from './repository';
export type { ShipmentDocument } from './model';
