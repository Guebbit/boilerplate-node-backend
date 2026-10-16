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
import { availabilityProductOf, preorderIdsOf } from './preorder';

/** One product's shelf: the document (`null` = hard-deleted) and the units for sale. */
export interface Shelf {
    /** Unscoped join: a hidden or soft-deleted product still resolves. */
    product: Lean<ProductDocument> | null;
    /** The ledger's units for sale; absent for a product with no level row. */
    available: number | undefined;
}

/**
 * Read the shelf of every product, in two queries however many there are: the catalogue first,
 * then the ledger, which needs to know which products are preorders.
 *
 * @param productIds - the products to look up; repeats are fine
 * @returns one entry per distinct id, in the order first seen
 */
export const readShelf = (productIds: readonly string[]): Promise<Map<string, Shelf>> => {
    const ids = [...new Set(productIds)];
    return productService.findManyByIds(ids).then((products) => {
        const byId = new Map(products.map((product) => [String(product._id), product]));
        // The catalogue says which are preorders; the ledger then answers their allowance, not the shelf.
        const preorders = preorderIdsOf(
            ids.map((id) => ({ productId: id, product: byId.get(id) ?? null }))
        );
        return inventoryService
            .availableFor(ids, preorders)
            .then(
                (available) =>
                    new Map(
                        ids.map((id) => [
                            id,
                            { product: byId.get(id) ?? null, available: available.get(id) }
                        ])
                    )
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
): LineAvailability =>
    lineAvailability({ product: availabilityProductOf(product), available, quantity });

/**
 * Whether the catalogue shows the product publicly — the same test `findPublicById` applies. A
 * product merely off sale is listed; a hidden or deleted one is not.
 *
 * @param shelf - the product and its ledger units
 */
export const isListed = (shelf: Shelf): boolean => shelfAvailability(shelf) !== 'removed';

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
