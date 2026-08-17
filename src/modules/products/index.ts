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

/**
 * The demo catalogue, for the three modules that seed rows pointing at it.
 *
 * `SEED_PRODUCT_IDS` is what `cart` and `wishlist` need — a handle, named by what the row is for.
 * `productFixtures` is what `orders` needs, because an order item embeds a product SNAPSHOT and a
 * snapshot is the record, not a reference to it.
 *
 * This widens the barrel on purpose, and the older arrangement is why. The seed data used to sit in
 * a file no module owned precisely so that no module would have to import a sibling's fixtures —
 * but all three of these already declare a `conformist` edge here and already import this module's
 * code at runtime, so the coupling was never avoided, only relocated somewhere it could not be
 * seen. Deleting this module breaks their seeds exactly as it breaks their services.
 */
export { SEED_PRODUCT_IDS, productFixtures } from './seeds';
