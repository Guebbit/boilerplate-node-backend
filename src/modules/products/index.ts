/**
 * @module
 * Products — public barrel, the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `productRepository` and the model's runtime
 * (`productSchema`, `applyProductTransform`, `productModel`) stay inside — a sibling reads or
 * moves a counter through `productService`, never the collection directly.
 */

export * from './service';

export * from './events';

/**
 * Resolves a product's `taxClass` into the decimal VAT rate it is charged. Published so `orders`
 * can freeze the resolved rate onto an order line at checkout time — see `services/snapshot.ts`.
 */
export { resolveTaxRate } from './tax';
export type { TaxClass } from './tax';

/** A fixture product row for a sibling's own tests. */
export { makeProduct } from './factories';
export type { ProductOverrides, ProductFixture } from './factories';

export type * from './model';
