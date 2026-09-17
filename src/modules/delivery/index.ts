/**
 * @module
 * Delivery — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). The domain rules are the load-bearing export:
 * cart's checkout prices the chosen method through `findShippingMethod`/`priceShipping`, so the
 * frozen order total and the `/methods` quote can never disagree. `shipmentRepository` and the
 * model's runtime stay inside — no other export here is a write handle on the collection.
 *
 * See: docs/modules/delivery.md
 */

export * from './domain';

export * from './service';

export * from './emails';

export type * from './model';
