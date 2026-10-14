/**
 * @module
 * The one place a product document becomes the `Product` contract — every read path that builds
 * from a document agrees here, `services/read.ts`'s `getById` included, rather than a hand-written
 * `.toJSON() as Product` cast in each. Search's lean rows never hold a document: they take the
 * derived fields from {@link derivedStockFields}.
 */

import type { Product } from '@types';
import { carryVersion } from '@infrastructure/persistence/versioning';
import { availableStock, stockFlags } from './domain/stock';
import { isPreorder, type PreorderFacts } from './domain/preorder';
import { lowStockThreshold, productCurrency } from './config';
import type { ProductDocument } from './model';

/**
 * The block of a product's response that is derived, never stored: `available`, the `inStock` /
 * `lowStock` flags, `preorder` and the live `currency`. One place, because the document's own
 * serialisation and a presented document must agree on every one of them.
 *
 * @param facts - the two stock counters and what decides a preorder
 * @returns the derived fields of a `Product`
 */
export const derivedStockFields = (
    facts: PreorderFacts & { onHand?: number; reserved?: number }
) => {
    const available = availableStock(facts.onHand, facts.reserved);
    const preorder = isPreorder(facts, new Date());
    const flags = stockFlags(available, lowStockThreshold());

    return {
        available,
        ...flags,
        // A preorder waits for stock that does not exist yet: it is not "running low".
        ...(preorder ? { lowStock: false } : {}),
        preorder,
        currency: productCurrency()
    };
};

/**
 * Maps a document straight onto the `Product` contract: `id` from the Mongoose getter, `available`
 * and the `inStock`/`lowStock`/`preorder` flags derived from the two stock counters (never stored), `currency` read live from
 * `NODE_DEFAULT_CURRENCY`, the three dates ISO-stringified. The row's version is not part of the
 * contract, so it rides beside the result (`carryVersion`) for the `ETag`.
 */
export const presentProduct = (document: ProductDocument): Product => {
    return carryVersion(document, {
        id: document.id,
        title: document.title,
        price: document.price,
        ...derivedStockFields(document),
        ...(document.taxClass === undefined ? {} : { taxClass: document.taxClass }),
        ...(document.rateType === undefined ? {} : { rateType: document.rateType }),
        ...(document.sku === undefined ? {} : { sku: document.sku }),
        ...(document.onHand === undefined ? {} : { onHand: document.onHand }),
        ...(document.reserved === undefined ? {} : { reserved: document.reserved }),
        ...(document.description === undefined ? {} : { description: document.description }),
        ...(document.active === undefined ? {} : { active: document.active }),
        ...(document.purchasable === undefined ? {} : { purchasable: document.purchasable }),
        ...(document.releaseDate === undefined
            ? {}
            : { releaseDate: document.releaseDate.toISOString() }),
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
