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

/** One product's shelf: the document (`null` = hard-deleted) and the units for sale. */
export interface Shelf {
    /** Unscoped join: an inactive or soft-deleted product still resolves. */
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
 * Units a customer may buy of a shelf's product, or `null` when it is not publicly visible (hard
 * deleted, soft-deleted or deactivated). The ledger's count, never the catalogue's cached copy.
 *
 * @param shelf - the product and its ledger units
 * @returns units for sale (0 for a product with no level row), or `null` when it cannot be bought at all
 */
export const sellableUnits = ({ product, available }: Shelf): number | null =>
    product && product.active !== false && product.deletedAt === undefined
        ? (available ?? 0)
        : null;
