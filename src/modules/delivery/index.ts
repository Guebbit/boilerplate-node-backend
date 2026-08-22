/**
 * Delivery — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 *
 * The domain rules are the load-bearing export: the cart's checkout prices the chosen method
 * through `findShippingMethod`/`priceShipping`, so the number an order freezes and the number
 * this module's `/methods` endpoint quotes can never disagree.
 */

/*
 * Two pure functions and nothing else — the narrowest surface in the repo, and the one worth
 * copying. A caller can price a shipping method without learning that shipments, couriers or a
 * `shipmentRepository` exist, which is what makes this a published language rather than a handle on
 * this module's storage.
 */
export { findShippingMethod, priceShipping } from './domain';
