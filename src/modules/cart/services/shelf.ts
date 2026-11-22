/**
 * @module
 * What the merge needs about a set of products: the joined product and how many can be bought,
 * read together once, so a merge reads the catalogue and inventory a fixed number of times per
 * request however many lines it carries.
 *
 * @see docs/modules/cart.md#stock-checked-in-three-places
 */

import { inventoryService } from '@modules/inventory';
import { productService } from '@modules/products';
import type { ProductDocument } from '@modules/products';
import type { Lean } from '@infrastructure/persistence/create-repository';

/** One product's shelf: the document (`null` = hard-deleted) and how many can be bought. */
export interface Shelf {
    /** Unscoped join: a hidden or soft-deleted product still resolves. */
    product: Lean<ProductDocument> | null;
    /** How many can be bought now, `0` for a product that cannot be; `undefined` is no limit. */
    quantityAvailable: number | undefined;
}

/**
 * Read the shelf of every product, in two reads however many there are: the catalogue and
 * inventory's live availability.
 *
 * @param productIds - the products to look up; repeats are fine
 * @returns one entry per distinct id, in the order first seen
 */
export const readShelf = (productIds: readonly string[]): Promise<Map<string, Shelf>> => {
    const ids = [...new Set(productIds)];
    return Promise.all([
        productService.findManyByIds(ids),
        inventoryService.liveAvailabilityOf(ids)
    ]).then(([products, stock]) => {
        const byId = new Map(products.map((product) => [String(product._id), product]));
        return new Map(
            ids.map((id) => [
                id,
                {
                    product: byId.get(id) ?? null,
                    // An id with no availability has no product to buy.
                    quantityAvailable: stock.has(id) ? stock.get(id)?.quantityAvailable : 0
                }
            ])
        );
    });
};

/**
 * Whether the catalogue shows the product publicly — the same test `findPublicById` applies. A
 * product merely off sale is listed; a hidden or deleted one is not.
 *
 * @param shelf - the product and how many can be bought
 */
export const isListed = ({ product }: Shelf): boolean =>
    product !== null && product.active !== false && !product.deletedAt;
