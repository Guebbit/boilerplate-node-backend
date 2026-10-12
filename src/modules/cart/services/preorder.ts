/**
 * @module
 * What the cart needs to know about preorders before it asks the ledger anything: which of a set
 * of joined products are on sale before their release date, and the product facts the availability
 * rule judges them on.
 *
 * The catalogue decides, never the ledger: `inventory` has no idea what a release date is, so the
 * cart names the preorder products and `availableFor` answers with what is left of their allowance
 * instead of the shelf.
 *
 * See: docs/modules/cart.md#line-availability
 */

import { isPreorder } from '@modules/products';
import type { ProductDocument } from '@modules/products';
import type { Lean } from '@infrastructure/persistence/create-repository';
import type { AvailabilityProduct } from '../domain';

/** A joined product, or `null` for a hard-deleted one. */
type JoinedProduct = Lean<ProductDocument> | null;

/**
 * The ids of the products that are preorders right now.
 *
 * @param lines - anything carrying a product id and its joined product
 * @returns the ids to hand `inventoryService.availableFor`, so it reads their allowance
 */
export const preorderIdsOf = (
    lines: readonly { productId: string; product: JoinedProduct }[]
): ReadonlySet<string> =>
    new Set(
        lines
            .filter(({ product }) => product !== null && isPreorder(product, new Date()))
            .map(({ productId }) => productId)
    );

/**
 * A joined product as the availability rule reads it, with its preorder flag decided.
 *
 * @param product - the joined product, `null` for a hard-deleted one
 */
export const availabilityProductOf = (product: JoinedProduct): AvailabilityProduct | null =>
    product && {
        active: product.active,
        purchasable: product.purchasable,
        deletedAt: product.deletedAt,
        preorder: isPreorder(product, new Date())
    };
