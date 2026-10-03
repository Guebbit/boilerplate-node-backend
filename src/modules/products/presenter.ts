/**
 * @module
 * The one place a product document becomes the `Product` contract — every read path agrees here,
 * `services/read.ts`'s `getById` included, rather than a hand-written `.toJSON() as Product` cast
 * in each.
 */

import type { Product } from '@types';
import { carryVersion } from '@infrastructure/persistence/versioning';
import { availableStock, stockFlags } from './domain/stock';
import { lowStockThreshold, productCurrency } from './config';
import type { ProductDocument } from './model';

/**
 * Maps a document straight onto the `Product` contract: `id` from the Mongoose getter, `available`
 * and the `inStock`/`lowStock` flags derived from the two stock counters (never stored), `currency` read live from
 * `NODE_DEFAULT_CURRENCY`, the three dates ISO-stringified. The row's version is not part of the
 * contract, so it rides beside the result (`carryVersion`) for the `ETag`.
 */
export const presentProduct = (document: ProductDocument): Product => {
    const onHand = document.onHand ?? 0;
    const reserved = document.reserved ?? 0;
    const available = availableStock(onHand, reserved);

    return carryVersion(document, {
        id: document.id,
        title: document.title,
        price: document.price,
        available,
        ...stockFlags(available, lowStockThreshold()),
        currency: productCurrency(),
        ...(document.taxClass === undefined ? {} : { taxClass: document.taxClass }),
        ...(document.rateType === undefined ? {} : { rateType: document.rateType }),
        ...(document.sku === undefined ? {} : { sku: document.sku }),
        ...(document.onHand === undefined ? {} : { onHand: document.onHand }),
        ...(document.reserved === undefined ? {} : { reserved: document.reserved }),
        ...(document.description === undefined ? {} : { description: document.description }),
        ...(document.active === undefined ? {} : { active: document.active }),
        ...(document.requiresShipping === undefined
            ? {}
            : { requiresShipping: document.requiresShipping }),
        ...(document.noWithdrawal === undefined ? {} : { noWithdrawal: document.noWithdrawal }),
        ...(document.weight === undefined ? {} : { weight: document.weight }),
        ...(document.imageUrl === undefined ? {} : { imageUrl: document.imageUrl }),
        ...(document.thumbnailUrl === undefined ? {} : { thumbnailUrl: document.thumbnailUrl }),
        ...(document.categories === undefined ? {} : { categories: document.categories }),
        ...(document.tags === undefined ? {} : { tags: document.tags }),
        ...(document.createdAt ? { createdAt: document.createdAt.toISOString() } : {}),
        ...(document.updatedAt ? { updatedAt: document.updatedAt.toISOString() } : {}),
        ...(document.deletedAt ? { deletedAt: document.deletedAt.toISOString() } : {})
    });
};
