/**
 * Products — public barrel.
 *
 * The only surface a sibling module may import. Everything not re-exported here is internal, and
 * lint enforces that: reaching `@modules/products/service` from outside is an error, not a shortcut.
 *
 * Keep the surface narrow. Each export here is a promise to every other module that this shape will
 * not move, so add one only when a sibling genuinely needs it.
 */

export { productService } from './service';
export { productRepository } from './repository';
export { productModel, zodProductSchema } from './model';
export type { IProductDocument } from './model';

/**
 * The mongoose schema and its serialization transform, for modules that embed a product rather
 * than reference one. Orders snapshot the product as it was at purchase time, so they need the
 * shape itself — a reference would let a later catalogue edit rewrite the history of an order.
 */
export { productSchema, applyProductTransform } from './model';

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { PRODUCT_DELETED } from './events';
