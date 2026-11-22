/**
 * @module
 * Products — public barrel; the only surface a sibling module may import. `productRepository` and
 * the model's runtime (`productSchema`, `applyProductTransform`, `productModel`) stay inside — a
 * sibling reads products through `productService`, never the collection directly. Stock is not
 * here: it lives in `@modules/inventory`.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 * @see docs/modules/products.md#its-neighbourhood
 */

export * from './services';

export * from './events';

/** The path of a product's page on the paired frontend; the sitemap and the back-in-stock mail link to it. */
export { productPagePath } from './config';

/**
 * Resolves a product's `taxClass` into the decimal VAT rate it is charged. Published so `orders`
 * can freeze the resolved rate onto an order line at checkout time — see
 * `orders/services/snapshot.ts`.
 */
export { resolveTaxRate } from './tax';
export type { TaxClass, RateType } from './tax';

export * from './domain';

export type * from './model';
