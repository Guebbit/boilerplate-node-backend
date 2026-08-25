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
export { productSchema, applyProductTransform } from './model';

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { PRODUCT_DELETED } from './events';

/*
 * The demo catalogue is NOT re-exported here. It lives behind this module's second public path,
 * `@modules/products/demo`, which `cart`, `wishlist` and `orders` take for their own seeders.
 *
 * It used to come through this barrel, and the cost was that "what may a sibling import" and "what
 * is the production API" stopped being the same question — a domain's public surface included
 * test-and-demo data, and the deletability figures could not tell a runtime edge from a demo one.
 * Two named doors separate them without hiding either: the coupling is as declared as it ever was,
 * and `eslint-plugin-boundaries` now asserts that only a seeder walks
 * through the second one.
 */
