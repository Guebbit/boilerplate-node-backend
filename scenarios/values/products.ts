/**
 * @module
 * `products`' example values for the generated API client collections: the pinned catalogue rows,
 * by id, so a generated request asks for a product that exists.
 */

import type { CollectionValues } from '../collection-values';
import { SEED_PRODUCT_IDS } from '../product-ids';

/** The generated collections' product example values. */
export const collectionValues: CollectionValues = {
    byProperty: {
        id: SEED_PRODUCT_IDS.dogFoodStandard,
        productId: SEED_PRODUCT_IDS.dogFoodStandard
    },
    pathParam: (name, template) =>
        name === 'productId' || (name === 'id' && template.startsWith('/products'))
            ? SEED_PRODUCT_IDS.dogFoodStandard
            : undefined,
    tokens: {
        seedProductId: SEED_PRODUCT_IDS.dogFoodStandard,
        seedSoftDeletedProductId: SEED_PRODUCT_IDS.heaterSoftDeleted,
        seedInactiveProductId: SEED_PRODUCT_IDS.bundleInactive,
        seedOffSaleProductId: SEED_PRODUCT_IDS.bedOffSale
    }
};
