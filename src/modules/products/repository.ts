/**
 * @module
 * Product repository: standard CRUD via the repository factory, plus the catalogue's own query
 * rules and the counter transitions that back inventory (`onHand`/`reserved`). The exported type
 * is written out because Mongoose's generics are too large for TypeScript to serialize an
 * inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 */

import type { FacetCount } from '@types';
import { productModel, applyProductTransform } from './model';
import type { ProductDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import type { ImageWriteback } from '@infrastructure/adapters/image.worker';

/** One product's counters and the availability derived from them, as the stock board reads it. */
export interface AvailabilityRow {
    productId: string;
    title: string;
    onHand: number;
    reserved: number;
    available: number;
}

/**
 * What a non-admin caller is allowed to see: published, not soft-deleted — spread into any filter;
 * admin callers pass nothing and see everything.
 *
 * A `const` above the literal because three members below need it; reading it back off
 * `productRepository` only works through lazy property resolution.
 */
const PUBLIC_SCOPE: Readonly<Record<string, unknown>> = {
    active: true,
    deletedAt: { $exists: false }
};

/** The catalogue's repository: base CRUD from the factory, extended with scoping, facets, and the inventory counter transitions. */
export const productRepository: Repository<ProductDocument> & {
    publicScope: () => Record<string, unknown>;
    findByIdScoped: (
        productId: string,
        scope?: Record<string, unknown>
    ) => Promise<ProductDocument | null>;
    findPublicById: (productId: string) => Promise<ProductDocument | null>;
    facets: () => Promise<{ categories: FacetCount[]; tags: FacetCount[] }>;
    reserveUnits: (productId: string, quantity: number) => Promise<boolean>;
    commitUnits: (productId: string, quantity: number) => Promise<boolean>;
    releaseUnits: (productId: string, quantity: number) => Promise<boolean>;
    receiveUnits: (productId: string, quantity: number) => Promise<boolean>;
    adjustUnits: (productId: string, delta: number) => Promise<boolean>;
    countLowAvailability: (threshold: number) => Promise<number>;
    sumReserved: () => Promise<number>;
    availabilityPage: (options: {
        skip: number;
        limit: number;
        maxAvailable?: number;
    }) => Promise<{ items: AvailabilityRow[]; totalItems: number }>;
    writebackImage: ImageWriteback;
} = {
    ...createRepository<ProductDocument>(productModel, {
        transform: applyProductTransform,
        searchable: {
            objectIds: { id: '_id' },
            text: ['title', 'description'],
            arrayRegex: { category: 'categories', tag: 'tags' },
            // `title` searches the same column the public catalogue already exposes.
            regex: { title: 'title' },
            /*
             * Admin-effective: a stranger's visibility scope pins `active: true`, so the two
             * clauses contradict and the page is empty rather than listing the unlisted catalogue.
             */
            booleans: { active: 'active' },
            ranges: { price: { min: 'minPrice', max: 'maxPrice' } }
        }
    }),

    /** The published spelling of {@link PUBLIC_SCOPE}, for callers outside this file. */
    publicScope: (): Record<string, unknown> => ({ ...PUBLIC_SCOPE }),

    /**
     * Fetch one product, optionally narrowed to a caller's authorization scope.
     *
     * The id lookup and the scope are applied by the same query — checking visibility after the read
     * is how a scoped find turns into an information leak. No scope means no restriction, the admin
     * branch (see `createVisibilityScope`). `async` because `toObjectId` throws on a malformed id —
     * see `create-repository.ts`; `orders.findByIdScoped` is the same idea.
     *
     * @param productId - the product's id
     * @param scope - the caller's filter fragment, or `undefined` to read unrestricted
     * @returns the product if it matches the scope, otherwise `null`
     */
    findByIdScoped: async (productId: string, scope?: Record<string, unknown>) =>
        productRepository.findOne({ _id: toObjectId(productId), ...scope }),

    /**
     * The publicly visible product with this id, or `null` — {@link findByIdScoped} bound to the
     * public scope, used by `cart/services/reorder.ts` and `wishlist/service.ts`.
     *
     * @param productId - the product's id
     * @returns the product if it is published and not soft-deleted, otherwise `null`
     */
    findPublicById: (productId: string) =>
        productRepository.findByIdScoped(productId, PUBLIC_SCOPE),

    /**
     * Every category and tag the PUBLIC catalogue carries, counted.
     *
     * One `$facet` pipeline rather than two, so both lists count against the same snapshot — two
     * round trips could disagree about a product written in between. `$match` reuses `PUBLIC_SCOPE`
     * itself, so a category held only by hidden products can't render as a chip that finds nothing.
     */
    facets: () =>
        productModel
            .aggregate<{
                categories: { _id: string; count: number }[];
                tags: { _id: string; count: number }[];
            }>([
                { $match: { ...PUBLIC_SCOPE } },
                {
                    $facet: {
                        categories: [
                            { $unwind: '$categories' },
                            { $group: { _id: '$categories', count: { $sum: 1 } } },
                            { $sort: { count: -1, _id: 1 } }
                        ],
                        tags: [
                            { $unwind: '$tags' },
                            { $group: { _id: '$tags', count: { $sum: 1 } } },
                            { $sort: { count: -1, _id: 1 } }
                        ]
                    }
                }
            ])
            .then((results) => ({
                categories: (results.at(0)?.categories ?? []).map(({ _id, count }) => ({
                    name: _id,
                    count
                })),
                tags: (results.at(0)?.tags ?? []).map(({ _id, count }) => ({ name: _id, count }))
            })),

    /*
     * The counter transitions — the only writes to `onHand`/`reserved`, living here because each is
     * one conditional `updateOne`; which transition is legal when belongs to `@modules/inventory`.
     *
     * Every one is conditional: the guard rides IN the filter, so mongod evaluates it atomically and
     * two checkouts racing the last unit cannot both take it. None returns `void` — an unmatched
     * write must be detectable, unlike the old `incrementStock`, which lost units silently.
     *
     * `timestamps: false` throughout — stock moving isn't an edit to the catalogue entry.
     */

    /**
     * Hold units for an order that has not been paid for.
     *
     * `$expr` rather than a plain field comparison, because the guard is between two fields of the
     * same document and no static filter value can express `onHand - reserved >= quantity`.
     *
     * @param productId - the product
     * @param quantity - how many to hold
     * @returns whether there were that many unclaimed units
     */
    reserveUnits: (productId: string, quantity: number) =>
        productModel
            .updateOne(
                {
                    _id: toObjectId(productId),
                    $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, quantity] }
                },
                { $inc: { reserved: quantity } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * Turn a hold into a sale — the units leave and stop being reserved.
     *
     * Both counters drop together, so `available` does not move: the units became unavailable
     * when they were reserved, and this is only the moment they stop existing.
     *
     * @param productId - the product
     * @param quantity - how many to commit
     * @returns whether the hold and the units were both there to commit
     */
    commitUnits: (productId: string, quantity: number) =>
        productModel
            .updateOne(
                {
                    _id: toObjectId(productId),
                    onHand: { $gte: quantity },
                    reserved: { $gte: quantity }
                },
                { $inc: { onHand: -quantity, reserved: -quantity } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * Give up a hold — the units are still here and become sellable again.
     *
     * Guarded rather than unconditional, which is what makes a double release harmless: the
     * second matches nothing instead of inventing units that were never held.
     *
     * @param productId - the product
     * @param quantity - how many to release
     * @returns whether that many units were actually held
     */
    releaseUnits: (productId: string, quantity: number) =>
        productModel
            .updateOne(
                { _id: toObjectId(productId), reserved: { $gte: quantity } },
                { $inc: { reserved: -quantity } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * Units arrive from a supplier.
     *
     * @param productId - the product
     * @param quantity - how many arrived
     * @returns whether the product still exists — the only guard on a receipt
     */
    receiveUnits: (productId: string, quantity: number) =>
        productModel
            .updateOne(
                { _id: toObjectId(productId) },
                { $inc: { onHand: quantity } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * A stocktake correction — signed, because shrinkage is the common case and it is negative.
     *
     * Guarded so a correction can never take `onHand` below what is already reserved: those units
     * are promised to orders that exist, and finding fewer units than were sold is resolved by
     * cancelling orders, not by making availability negative.
     *
     * @param productId - the product
     * @param delta - signed; negative is shrinkage, positive a miscount in your favour
     * @returns whether the correction fit above what is reserved
     */
    adjustUnits: (productId: string, delta: number) =>
        productModel
            .updateOne(
                {
                    _id: toObjectId(productId),
                    $expr: { $gte: [{ $add: ['$onHand', delta] }, '$reserved'] }
                },
                { $inc: { onHand: delta } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * How many products a buyer would find at or under `threshold` units — counts AVAILABILITY, not
     * `onHand`, since fully-reserved stock reads as out of stock to a customer.
     *
     * @param threshold - the low-availability mark
     * @returns how many publicly visible products are at or under it
     */
    countLowAvailability: (threshold: number) =>
        productModel
            .countDocuments({
                ...PUBLIC_SCOPE,
                $expr: { $lte: [{ $subtract: ['$onHand', '$reserved'] }, threshold] }
            })
            .exec(),

    /**
     * Every unit currently promised to an open order, across the whole catalogue.
     * Summed over the products, not the holds, since the counters are what the shop acts on. No scope
     * filter — an inactive product with units held is exactly what an operator wants to see.
     *
     * @returns the total reserved units
     */
    sumReserved: () =>
        productModel
            .aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$reserved' } } }])
            .then((results) => results.at(0)?.total ?? 0),

    /**
     * A page of the stock board — counters plus availability, scarcest first. An aggregation, not a
     * `find`: `available` isn't a stored column, so it must be projected before it can be sorted.
     * `$facet` counts and pages against one snapshot, so the total can't disagree with the rows.
     *
     * Scaling limit: a derived sort has no index, so mongod sorts in memory (100MB cap, reachable in
     * the low millions) — the fix is a stored, transition-maintained column, deliberately not done
     * here since a third counter could disagree with the two it comes from.
     *
     * @param options - `skip`/`limit` for the page, and `maxAvailable` to keep only scarce rows
     * @returns the page and the count of everything matching
     */
    availabilityPage: ({ skip, limit, maxAvailable }) =>
        productModel
            .aggregate<{
                items: AvailabilityRow[];
                total: { count: number }[];
            }>([
                {
                    $addFields: {
                        available: {
                            // Clamped for the same reason the serializer clamps: `reserved` above
                            // `onHand` should be unreachable, but a negative must not reach a screen.
                            $max: [0, { $subtract: ['$onHand', '$reserved'] }]
                        }
                    }
                },
                ...(maxAvailable === undefined
                    ? []
                    : [{ $match: { available: { $lte: maxAvailable } } }]),
                {
                    $facet: {
                        items: [
                            // `title` breaks ties so a page boundary cannot show one product
                            // twice and another not at all — the reason `DEFAULT_SORT` exists.
                            { $sort: { available: 1, title: 1, _id: 1 } },
                            { $skip: skip },
                            { $limit: limit },
                            {
                                $project: {
                                    _id: 0,
                                    productId: { $toString: '$_id' },
                                    title: 1,
                                    onHand: 1,
                                    reserved: 1,
                                    available: 1
                                }
                            }
                        ],
                        total: [{ $count: 'count' }]
                    }
                }
            ])
            .then((results) => ({
                items: results.at(0)?.items ?? [],
                totalItems: results.at(0)?.total.at(0)?.count ?? 0
            })),

    /**
     * The image digest pipeline's writeback for the `products` collection — see `ImageTarget` in
     * `kernel/registry.ts`. Conditional on `pendingImageKey` still matching `key`, so a stale or
     * duplicate job delivery cannot overwrite a later upload, and a hard-deleted product is a
     * detectable miss rather than a write to nothing.
     *
     * `timestamps: false` — the digest finishing is not an edit an admin made.
     */
    writebackImage: (documentId, key, urls) =>
        productModel
            .updateOne(
                { _id: toObjectId(documentId), pendingImageKey: key },
                {
                    $set: { imageUrl: urls.imageUrl, thumbnailUrl: urls.thumbnailUrl },
                    $unset: { pendingImageKey: '' }
                },
                { timestamps: false }
            )
            .exec()
            .then(({ matchedCount }) => matchedCount > 0)
};
