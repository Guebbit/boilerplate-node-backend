/**
 * @module
 * Product factories that touch the test database. The BUILDER lives one level up in
 * `../factories.ts` — the same file the demo catalogue is built from — this file only persists
 * what it returns. See `../../users/tests/factories` for why there is exactly one `makeProduct`.
 */

import type { ProductDocument } from '../model';
import { productModel } from '../model';
import { productRepository } from '../repository';
import { makeProduct } from '../factories';
import type { ProductOverrides } from '../factories';
import { availableStock } from '../domain/stock';
import { productService } from '../service';

export { makeProduct, type ProductOverrides } from '../factories';

/**
 * Seed `@modules/inventory`'s stock level row to match a just-created product's own counters.
 *
 * Production never needs this: a real product always gets its level row through
 * `PRODUCT_CREATED` → `receive()`. This factory bypasses that event entirely for speed, so
 * without this a fixture's `onHand`/`reserved` would sit only in the product's cache — invisible
 * to `@modules/inventory`, whose own collection is what every transition and stock-board read
 * actually sources from. Written through the raw collection, by name, never a model import —
 * the same collection-by-string reach `@modules/inventory`'s own `$lookup`s use in the other
 * direction, and the only way a `products`-owned file can touch `stocklevels` at all without
 * importing a sibling module.
 */
const seedStockLevel = (product: ProductDocument): Promise<unknown> =>
    productModel.db.collection('stocklevels').updateOne(
        { productId: product._id },
        {
            $setOnInsert: {
                onHand: product.onHand ?? 0,
                reserved: product.reserved ?? 0,
                available: availableStock(product.onHand, product.reserved)
            }
        },
        { upsert: true }
    );

/**
 * Insert a product into the test database and return the Mongoose document.
 *
 * Defaults `onHand` to a sellable 10 — the schema's own default is 0, correct for a real write,
 * but useless as a test fixture: almost every checkout-touching test needs stock to actually
 * exist, and pinning it by hand at 89 call sites is how that number stopped meaning anything. A
 * test about "no stock" pins `onHand: 0` explicitly, which reads better than the absence it used
 * to rely on.
 */
export const createProduct = (overrides: ProductOverrides = {}): Promise<ProductDocument> =>
    productRepository
        .create(makeProduct({ onHand: 10, ...overrides }))
        .then((product) => seedStockLevel(product).then(() => product));

/**
 * The raw stored document, hydrated — a sibling's own assertion on persisted state. Never through
 * `productService`: a generic hydrated read is a step from becoming a generic write, which the
 * production barrel deliberately does not publish.
 */
export const readProduct = (id: string): Promise<ProductDocument | null> =>
    productRepository.findById(id);

/** Persist a document a sibling's fixture already built and mutated in memory. */
export const saveProduct = (document: ProductDocument): Promise<ProductDocument> =>
    productRepository.save(document);

/** Remove a product outright — a sibling's cleanup or negative-path fixture. */
export const deleteProduct = (document: ProductDocument): Promise<void> =>
    productRepository.deleteOne(document);

/**
 * A product's live stock counters, read the plain untransformed way `@modules/inventory` writes
 * them — the `onHand`/`reserved`/`available` triple a checkout, payment or reservation test reads
 * back after some mutation to prove units moved, not just that a call returned success.
 */
export const countersOf = (
    productId: unknown
): Promise<{ onHand?: number; reserved?: number; available: number }> =>
    productService.findByIdRaw(String(productId)).then((stored) => ({
        onHand: stored?.onHand,
        reserved: stored?.reserved,
        available: availableStock(stored?.onHand, stored?.reserved)
    }));
