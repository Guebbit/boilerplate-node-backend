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
 * A product's stored fields without the document machinery — what `orders` embeds on every line.
 * Published because that module's own types name it; see the note in `./model`.
 */
export type { ProductSnapshot } from './model';

/**
 * The mongoose schema and its serialization transform, for modules that embed a product rather
 * than reference one. Orders snapshot the product as it was at purchase time, so they need the
 * shape itself — a reference would let a later catalogue edit rewrite the history of an order.
 */
export { productSchema, applyProductTransform, toProduct } from './model';

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { PRODUCT_DELETED } from './events';

/*
 * The demo catalogue is NOT re-exported here, and never was reachable through this barrel: it
 * lives in `demo/products.ts`, outside `src/` entirely, imported by nothing this module ships.
 */
