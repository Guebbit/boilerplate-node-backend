/**
 * @module
 * Delivery — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 *
 * The domain rules are the load-bearing export: the cart's checkout prices the chosen method
 * through `findShippingMethod`/`priceShipping`, so the number an order freezes and the number
 * this module's `/methods` endpoint quotes can never disagree.
 *
 * See: docs/modules/delivery.md
 */

// Two pure functions and nothing else — a caller prices a shipping method without learning that
// shipments, couriers, or a `shipmentRepository` exist.
export { findShippingMethod, priceShipping } from './domain';
