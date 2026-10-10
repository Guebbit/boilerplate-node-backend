/**
 * @module
 * What is on the shelf for a set of products: the joined product plus the ledger's units, read
 * together once, so the merge reads the catalogue and the ledger in two queries per request.
 *
 * See: docs/modules/cart.md#stock-checked-in-three-places
 */

import { inventoryService } from '@modules/inventory';
import { productService } from '@modules/products';
import type { ProductDocument } from '@modules/products';
import type { Lean } from '@infrastructure/persistence/create-repository';
import { lineAvailability, type LineAvailability } from '../domain';

/** One product's shelf: the document (`null` = hard-deleted) and the units for sale. */
export interface Shelf {
    /** Unscoped join: a hidden or soft-deleted product still resolves. */
    product: Lean<ProductDocument> | null;
    /** The ledger's units for sale; absent for a product with no level row. */
    available: number | undefined;
}

/**
 * Read the shelf of every product, in two queries however many there are.
 *
 * @param productIds - the products to look up; repeats are fine
 * @returns one entry per distinct id, in the order first seen
 */
export const readShelf = (productIds: readonly string[]): Promise<Map<string, Shelf>> => {
    const ids = [...new Set(productIds)];
    return Promise.all([
        productService.findManyByIds(ids),
        inventoryService.availableFor(ids)
    ]).then(([products, available]) => {
        const byId = new Map(products.map((product) => [String(product._id), product]));
        return new Map(
            ids.map((id) => [id, { product: byId.get(id) ?? null, available: available.get(id) }])
        );
    });
};

/**
 * The availability of a shelf's product — the cart's one precedence rule, on what the join and
 * the ledger returned. The ledger's count, never the catalogue's cached copy.
 *
 * @param shelf - the product and its ledger units
 * @param quantity - units the line holds; omit for a wishlist line or a bare "is it listed" test
 * @returns the line's availability
 */
export const shelfAvailability = (
    { product, available }: Shelf,
    quantity?: number
): LineAvailability => lineAvailability({ product, available, quantity });

/**
 * The availability of each product as a line without a quantity: what a wishlist line reads.
 * Two queries however many products there are.
 *
 * @param productIds - the products to judge; repeats are fine
 * @returns one availability per distinct id, never `insufficient_stock`
 */
export const productAvailabilityFor = (
    productIds: readonly string[]
): Promise<Map<string, LineAvailability>> =>
    readShelf(productIds).then(
        (shelves) =>
            new Map([...shelves].map(([id, shelf]) => [id, shelfAvailability(shelf)] as const))
    );
