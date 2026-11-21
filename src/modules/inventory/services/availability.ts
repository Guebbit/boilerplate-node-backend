/**
 * @module
 * The availability reads: what a shopper is told about a product's stock, answered under the
 * catalogue's URL (`GET /products/{id}/availability`, `GET /products/availability?id=…`).
 *
 * Inventory owns the whole cache of this answer: one Redis entry per product, `availability:<id>`,
 * kept 60 seconds. It is cleared by every stock move (`transition.ts`) and by `product.terms_changed`
 * and `product.deleted` (`../module.ts`). The 60 seconds covers what nothing announces: a release
 * or restock date passing, and a change of the shop's calendar day.
 *
 * @see docs/modules/inventory.md#the-availability-reads
 */

import { z } from 'zod';
import { getJson } from '@guebbit/js-toolkit';
import { t } from '@infrastructure/i18n';
import { generateReject, generateSuccess } from '@infrastructure/http/response';
import { deleteCacheValues, getCacheValues, setCacheValue } from '@infrastructure/adapters/cache';
import { anonymousCaller } from '@kernel/permissions';
import { permitsOnRows } from '@kernel/ability';
import { availabilityOf, productService } from '@modules/products';
import { BACKORDER_PROMISE_DAYS, shopDayOf } from '@modules/shop';
import type { Caller, ProductAvailability, ProductAvailabilityResponse } from '@types';
import { stockLevelRepository } from '../repository';

/** How long an entry lives, seconds. Bounds what no write announces: a date passing, a new shop day. */
const AVAILABILITY_TTL_SECONDS = 60;

/** The cache key of one product's entry; the adapter adds its own prefix. */
const keyOf = (productId: string): string => `availability:${productId}`;

/**
 * What an entry holds: the answer, and the two facts that decide who may read it. The cache has no
 * caller in its key, so visibility is judged per caller AFTER the read ({@link readMany}).
 */
const storedSchema = z.object({
    productId: z.string(),
    availability: z.enum(['in_stock', 'out_of_stock', 'preorder', 'backorder']),
    availabilityDate: z.string().optional(),
    active: z.boolean(),
    // `null` is a live product; a soft-deleted one holds the day it went.
    deletedAt: z.string().nullable()
});

/** One cache entry. */
type Stored = z.infer<typeof storedSchema>;

/**
 * An entry from its cached text.
 *
 * @param raw - what the cache returned, `undefined` on a miss
 * @returns the entry, or `undefined` when there is none or it is not an entry (read as a miss)
 */
const parseStored = (raw: string | undefined): Stored | undefined => {
    if (raw === undefined) return undefined;
    // `getJson` answers `undefined` for text that is not JSON (an entry a torn write left); the schema refuses the rest.
    const parsed = storedSchema.safeParse(getJson(raw));
    return parsed.success ? parsed.data : undefined;
};

/**
 * Work out and store the entries for products the cache did not hold: one read of their levels,
 * one of their products. A product that does not exist has no entry.
 *
 * @param productIds - well-formed ids, no duplicates
 */
const build = (productIds: readonly string[]): Promise<Stored[]> =>
    Promise.all([
        stockLevelRepository.findManyByProductIds(productIds),
        productService.findManyByIds(productIds)
    ]).then(([levels, products]) => {
        const levelOf = new Map(levels.map((level) => [String(level.productId), level]));
        const now = new Date();

        const entries = products.map((product): Stored => {
            const productId = String(product._id);
            const level = levelOf.get(productId);
            const { availability, availabilityDate } = availabilityOf(
                {
                    active: product.active,
                    purchasable: product.purchasable,
                    releaseDate: product.releaseDate,
                    allowBackorder: product.allowBackorder,
                    restockDate: product.restockDate,
                    deletedAt: product.deletedAt ?? undefined
                },
                // A product with no level row yet reads as nothing on the shelf and no allowance.
                {
                    available: level?.available ?? 0,
                    backorderLimit: level?.backorderLimit,
                    backordered: level?.backordered
                },
                now,
                BACKORDER_PROMISE_DAYS
            );
            return {
                productId,
                availability,
                ...(availabilityDate === undefined
                    ? {}
                    : { availabilityDate: shopDayOf(availabilityDate) }),
                active: product.active !== false,
                deletedAt: product.deletedAt ? product.deletedAt.toISOString() : null
            };
        });

        return Promise.all(
            entries.map((entry) =>
                setCacheValue(
                    keyOf(entry.productId),
                    JSON.stringify(entry),
                    AVAILABILITY_TTL_SECONDS
                )
            )
        ).then(() => entries);
    });

/**
 * The availability of each product the caller may read, in the order asked.
 *
 * One MGET for every entry, one rebuild for the missing ones. A hidden or removed product is
 * answered for staff (`display:Product`) and left out for everyone else, a guest included, from a
 * hit as much as from a rebuild.
 *
 * @param productIds - well-formed ids; duplicates are answered once
 * @param caller - `request.caller`, absent for a guest
 */
const readMany = (
    productIds: readonly string[],
    caller: Caller | undefined
): Promise<ProductAvailability[]> => {
    const unique = [...new Set(productIds)];

    return getCacheValues(unique.map((productId) => keyOf(productId))).then((raws) => {
        const entries = new Map<string, Stored>();
        const missing: string[] = [];
        for (const [index, productId] of unique.entries()) {
            const hit = parseStored(raws[index]);
            if (hit) entries.set(productId, hit);
            else missing.push(productId);
        }

        return (missing.length > 0 ? build(missing) : Promise.resolve([])).then((built) => {
            for (const entry of built) entries.set(entry.productId, entry);

            // `read:Product` is "active and not deleted"; `display:Product` has no condition.
            const permits = permitsOnRows(caller ?? anonymousCaller(), 'Product', ['read']);
            return unique.flatMap((productId) => {
                const entry = entries.get(productId);
                if (!entry || !permits(entry).read) return [];
                const { availability, availabilityDate } = entry;
                return [
                    {
                        productId,
                        availability,
                        ...(availabilityDate === undefined ? {} : { availabilityDate })
                    }
                ];
            });
        });
    });
};

/**
 * `GET /products/{id}/availability`.
 *
 * @param productId - a well-formed id
 * @param caller - `request.caller`, absent for a guest
 * @returns the answer, or the 404 an unknown or hidden product gets from `GET /products/{id}`
 */
export const getProductAvailability = (productId: string, caller: Caller | undefined) =>
    readMany([productId], caller).then((items) => {
        const item = items.at(0);
        return item
            ? generateSuccess<ProductAvailability>(item)
            : generateReject(404, [t('products.not-found')]);
    });

/**
 * `GET /products/availability?id=…`.
 *
 * @param productIds - well-formed ids, at most 100 (the contract's bound, checked by the controller)
 * @param caller - `request.caller`, absent for a guest
 */
export const listProductAvailability = (
    productIds: readonly string[],
    caller: Caller | undefined
) =>
    readMany(productIds, caller).then((items) =>
        generateSuccess<ProductAvailabilityResponse>({ items })
    );

/**
 * Forget these products' answers. Called after a write that could change one; never rejects, and
 * the entry's own 60 seconds bounds a delete that did not land.
 *
 * @param productIds - the products whose entry to delete; every id, whether it has an entry or not
 */
export const forgetAvailability = (productIds: readonly string[]): Promise<void> =>
    deleteCacheValues([...new Set(productIds)].map((productId) => keyOf(productId)));
