/**
 * @module
 * Products — public barrel, the only surface a sibling module may import. Lint enforces it:
 * reaching `@modules/products/service` from outside is an error. Keep the surface narrow — each
 * export here is a promise not to move.
 */

export { productService } from './service';
export { productRepository } from './repository';
export type { ProductDocument } from './model';

/**
 * A product's stored fields without the document machinery — the base `ProductDocument` extends.
 * Published for fixtures and lean reads outside this module that need the plain shape.
 */
export type { ProductRecord } from './model';

/**
 * A product as an ORDER LINE remembers it — `ProductRecord` without `onHand`/`reserved`. Published
 * because `orders/model.ts` types its embedded snapshot with this, not with `ProductRecord`: an
 * order line must not be able to carry a live warehouse counter, only what a customer saw.
 */
export type { ProductSnapshot } from './model';

/** The mongoose schema and its serialization transform, for this module's own callers. */
export { productSchema, applyProductTransform, toProduct } from './model';

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { PRODUCT_DELETED, PRODUCT_CREATED } from './events';

/*
 * The demo catalogue is NOT re-exported here, and never was reachable through this barrel: it
 * lives in `scenarios/products.ts`, outside `src/` entirely, imported by nothing this module ships.
 */
