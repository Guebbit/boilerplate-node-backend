/**
 * @module
 * Delivery — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). The domain rules are the load-bearing export:
 * cart's checkout prices the chosen method through `findShippingMethod`/`priceShipping`, so the
 * frozen order total and the `/methods` quote can never disagree; `returns` reads what has shipped and
 * cancels what has not through `shippedQuantities` and `cancelRemainder`. The two repositories and the
 * models' runtime stay inside — no other export here is a write handle on a collection.
 *
 * See: docs/modules/delivery.md
 */

export * from './services';

export * from './domain';

export * from './events';

export * from './emails';

export type * from './model';
