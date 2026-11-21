/**
 * @module
 * The one place a product document becomes the `Product` contract — every read path that builds
 * from a document agrees here, `services/read.ts`'s `getById` included, rather than a hand-written
 * `.toJSON() as Product` cast in each. The product carries no stock: availability is
 * `inventory`'s own read, so the derived block is just the live `currency` and `actions`.
 */

import type { Product } from '@types';
import { carryVersion } from '@infrastructure/persistence/versioning';
import { NO_PRODUCT_ACTIONS } from './domain/actions';
import type { ProductDocument } from './model';
import { shopCurrency, shopDayOf } from '@modules/shop';
import { padDecimal } from '@domain-primitives/money';

/**
 * Maps a document straight onto the `Product` contract: `id` from the Mongoose getter,
 * `currency` read live from `NODE_DEFAULT_CURRENCY` (never stored), `actions` all `false` (no
 * caller yet; `services/actions.ts` stamps the real ones), `createdAt`/`updatedAt`/`deletedAt` as
 * ISO strings and the promise dates as the shop's day. The row's version is not part of the contract,
 * so it rides beside the result (`carryVersion`) for the `ETag`.
 */
export const presentProduct = (document: ProductDocument): Product => {
    return carryVersion(document, {
        id: document.id,
        title: document.title,
        // The wire spelling: the stored Decimal128 forgot its trailing zeros; the shop's live currency fixes the places.
        price: padDecimal(document.price, shopCurrency()),
        currency: shopCurrency(),
        actions: NO_PRODUCT_ACTIONS,
        ...(document.taxClass === undefined ? {} : { taxClass: document.taxClass }),
        ...(document.rateType === undefined ? {} : { rateType: document.rateType }),
        ...(document.sku === undefined ? {} : { sku: document.sku }),
        ...(document.description ? { description: document.description } : {}),
        ...(document.active === undefined ? {} : { active: document.active }),
        ...(document.purchasable === undefined ? {} : { purchasable: document.purchasable }),
        ...(document.releaseDate === undefined
            ? {}
            : { releaseDate: shopDayOf(document.releaseDate) }),
        ...(document.allowBackorder === undefined
            ? {}
            : { allowBackorder: document.allowBackorder }),
        ...(document.restockDate === undefined
            ? {}
            : { restockDate: shopDayOf(document.restockDate) }),
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
