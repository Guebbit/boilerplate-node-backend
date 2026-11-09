/**
 * @module
 * What a caller may do to one product, as flags. Pure: the caller's keys arrive as a
 * {@link ProductStanding}, the product's state as its `deletedAt`.
 */

import type { ProductActions } from '@types';

/** Which of the product keys a caller holds, already combined the way the doors need them. */
export interface ProductStanding {
    /** The caller holds `update:Product` AND `update:Translation`: a write carries both. */
    update: boolean;
    /** The caller holds `delete:Product`: soft delete, restore and hard delete share it. */
    delete: boolean;
}

/** The standing of a caller who holds nothing: every flag derived from it is `false`. */
export const NO_PRODUCT_STANDING: ProductStanding = { update: false, delete: false };

/** Every flag `false`: a product read for nobody in particular. */
export const NO_PRODUCT_ACTIONS: ProductActions = {
    update: false,
    delete: false,
    restore: false,
    hardDelete: false
};

/**
 * What the caller may do to one product.
 *
 * @param product - the part of the product the rule reads: whether it is soft-deleted
 * @param standing - how the caller stands to the product keys
 * @returns one flag per door
 */
export const productActions = (
    product: { deletedAt?: unknown },
    standing: ProductStanding
): ProductActions => {
    const deleted = Boolean(product.deletedAt);

    return {
        update: standing.update,
        delete: standing.delete && !deleted,
        restore: standing.delete && deleted,
        hardDelete: standing.delete
    };
};
