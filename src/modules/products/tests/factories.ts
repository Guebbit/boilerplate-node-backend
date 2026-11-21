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
import { Types } from 'mongoose';

export { makeProduct, type ProductOverrides } from '../factories';

/**
 * The live repository object, for a sibling's `jest.spyOn` — a wrapper function copies the call,
 * not the binding, so it cannot intercept what `productService`'s OWN code reaches internally.
 * Every other need above has a named, narrower helper instead; reach for this one only when the
 * assertion is "did the write fail/get retried", not "what does the database now hold".
 */
export { productRepository } from '../repository';

/** The stock a fixture starts with: it lives on `@modules/inventory`'s level, never on the product. */
export interface StockOverrides {
    /** Units that exist; defaults to a sellable 10. */
    onHand?: number;
    /** Units an open order has claimed. */
    reserved?: number;
    /** The preorder/backorder allowance; `null` is no cap. */
    backorderLimit?: number | null;
    /** Units already claimed against the allowance. */
    backordered?: number;
}

/**
 * Write `@modules/inventory`'s stock level row for a just-created product.
 *
 * Production never needs this: a real product always gets its level row through
 * `PRODUCT_CREATED` → `receive()`. This factory bypasses that event entirely for speed, so
 * without it a fixture would have no stock at all. Written through the raw collection, by name,
 * never a model import — the same collection-by-string reach `@modules/inventory`'s own `$lookup`s
 * use in the other direction, and the only way a `products`-owned file can touch `stocklevels`
 * at all without importing a sibling module.
 *
 * @param product - the product the row belongs to
 * @param stock - the counters to start from
 */
const seedStockLevel = (
    product: ProductDocument,
    { onHand, reserved, backorderLimit, backordered }: { onHand: number } & StockOverrides
): Promise<unknown> =>
    productModel.db.collection('stocklevels').updateOne(
        { productId: product._id },
        {
            $setOnInsert: {
                onHand,
                reserved: reserved ?? 0,
                available: availableStock(onHand, reserved),
                backorderLimit: backorderLimit === undefined ? 0 : backorderLimit,
                backordered: backordered ?? 0
            }
        },
        { upsert: true }
    );

/**
 * Insert a product into the test database and return the Mongoose document.
 *
 * Defaults the stock level to a sellable 10 `onHand` — a real product with no level reads as
 * nothing on the shelf, but that is useless as a test fixture: almost every checkout-touching
 * test needs stock to actually exist, and pinning it by hand at 89 call sites is how that number
 * stopped meaning anything. A test about "no stock" pins `onHand: 0` explicitly, which reads
 * better than the absence it used to rely on. The stock overrides go to the level row only.
 */
export const createProduct = ({
    onHand = 10,
    reserved,
    backorderLimit,
    backordered,
    ...overrides
}: ProductOverrides & StockOverrides = {}): Promise<ProductDocument> =>
    productRepository
        .create(makeProduct(overrides))
        .then((product) =>
            seedStockLevel(product, { onHand, reserved, backorderLimit, backordered }).then(
                () => product
            )
        );

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
 * A product's live stock counters, read off `@modules/inventory`'s level the plain untransformed
 * way — the `onHand`/`reserved`/`available` triple a checkout, payment or reservation test reads
 * back after some mutation to prove units moved, not just that a call returned success.
 */
export const countersOf = (
    productId: unknown
): Promise<{ onHand?: number; reserved?: number; available: number }> =>
    productModel.db
        .collection<{ onHand: number; reserved: number }>('stocklevels')
        .findOne({ productId: new Types.ObjectId(String(productId)) })
        .then((level) => ({
            onHand: level?.onHand,
            reserved: level?.reserved,
            available: availableStock(level?.onHand, level?.reserved)
        }));
