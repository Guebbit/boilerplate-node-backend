/**
 * @module
 * Delivery — public barrel, the only surface a sibling module may import (see
 * `modules/products/index.ts` for the rule). The domain rules are the load-bearing export: cart's
 * checkout prices the chosen method through `findShippingMethod`/`priceShipping`, so the frozen
 * order total and the `/methods` quote can never disagree. See: docs/modules/delivery.md
 */

// Two pure functions and nothing else — a caller prices a shipping method without learning that
// shipments, couriers, or a `shipmentRepository` exist.
export { findShippingMethod, priceShipping } from './domain';
