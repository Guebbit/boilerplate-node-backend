import type { FacetCount } from '@types';
import { productModel, applyProductTransform } from './model';
import type { ProductDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';

/**
 * Product Repository
 * Standard CRUD via the repository factory, plus the catalogue's own query rules.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 */
/** One product's counters and the availability derived from them, as the stock board reads it. */
export interface AvailabilityRow {
    productId: string;
    title: string;
    onHand: number;
    reserved: number;
    available: number;
}

/**
 * What a non-admin caller is allowed to see: published, not soft-deleted. A rule about which *rows*
 * exist for an audience, so it belongs to the repository — spread it into any filter. Admin callers
 * pass nothing and see everything.
 *
 * A `const` above the literal because three members below need it, and reading it back off
 * `productRepository` would only work through lazy property resolution.
 */
const PUBLIC_SCOPE: Readonly<Record<string, unknown>> = {
    active: true,
    deletedAt: { $exists: false }
};

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
     * The id lookup and the scope are applied by the same query — checking visibility after the
     * read is how a scoped find turns into an information leak. No scope means no restriction,
     * which is the admin branch (see `createVisibilityScope`).
     *
     * `async` because `toObjectId` throws on a malformed id — see `create-repository.ts`.
     * `orders.findByIdScoped` is the same idea.
     *
     * @param productId - the product's id
     * @param scope - the caller's filter fragment, or `undefined` to read unrestricted
     * @returns the product if it matches the scope, otherwise `null`
     */
    findByIdScoped: async (productId: string, scope?: Record<string, unknown>) =>
        productRepository.findOne({ _id: toObjectId(productId), ...scope }),

    /**
     * The publicly visible product with this id, or `null`.
     *
     * {@link findByIdScoped} bound to the public scope, named so "a hidden product cannot be
     * wishlisted or reordered" is one call rather than a spread each caller must remember. The
     * two domain readers that want exactly this — `cart/services/reorder.ts`, `wishlist/service.ts`
     * — never vary by role, so they say what they mean instead of building a scope.
     *
     * @param productId - the product's id
     * @returns the product if it is published and not soft-deleted, otherwise `null`
     */
    findPublicById: (productId: string) =>
        productRepository.findByIdScoped(productId, PUBLIC_SCOPE),

    /**
     * Every category and tag the PUBLIC catalogue carries, counted.
     *
     * One `$facet` pipeline rather than two aggregations, so both lists are counted against the
     * same snapshot of the collection — two round trips could disagree with each other about a
     * product written in between. The `$match` is `PUBLIC_SCOPE` itself, not a copy of its
     * conditions: a category held only by hidden products renders as a filter chip that finds
     * nothing.
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
     * The counter transitions — the only writes to `onHand` and `reserved` in the codebase.
     *
     * They live here, in the repository that owns the collection, because each is one conditional
     * `updateOne` and none of them knows what a reservation is. Which transition is legal when,
     * and the ledger row that must accompany it, belong to `@modules/inventory` — the only caller.
     *
     * Every one is conditional and answers whether it matched. The guard rides IN the filter, so
     * mongod evaluates it while holding the document and two checkouts racing the last unit cannot
     * both take it. There is no unconditional counter write anywhere: the previous design's
     * `incrementStock` returned `void`, so a cancel whose product had been hard-deleted lost its
     * units silently.
     *
     * `timestamps: false` throughout — stock moving is not an edit to the catalogue entry, and
     * `updatedAt` keeps meaning "the product changed".
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
     * How many products a buyer would find at or under `threshold` units.
     *
     * Counts AVAILABILITY rather than `onHand`, which is the number an operator restocking the
     * shop cares about: a product with forty units all reserved is out of stock to every customer
     * looking at it, and a gauge reading forty would say the opposite.
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
     *
     * Summed over the products rather than the holds: the counters are what the shop acts on, so a
     * total taken from them measures the thing that would oversell if it were wrong. No scope
     * filter — an inactive product with units still held is exactly what an operator wants to see.
     *
     * @returns the total reserved units
     */
    sumReserved: () =>
        productModel
            .aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$reserved' } } }])
            .then((results) => results.at(0)?.total ?? 0),

    /**
     * A page of the stock board — counters plus availability, scarcest first.
     *
     * An aggregation rather than a `find`, because the sort key does not exist as a column:
     * availability is `onHand - reserved`, so it has to be projected before it can be sorted or
     * filtered on. Doing that in mongod rather than in the service is what keeps this bounded —
     * an earlier version read the whole catalogue with `limit: 0` and sorted it in JavaScript,
     * which is fine for five products and fatal for fifty thousand.
     *
     * `$facet` runs the count and the page against one snapshot of the collection, so the total
     * cannot disagree with the rows beside it.
     *
     * The scaling limit, stated rather than left to be discovered: `available` is derived, so no
     * index can cover the sort and mongod does it in memory. That is bounded by its 100MB sort
     * limit, which a catalogue in the low millions would reach. The fix at that size is to store
     * `available` as a real column maintained by the same transitions that move the counters, and
     * index it — deliberately not done here, because a stored third counter is one more thing that
     * can disagree with the two it comes from.
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
            }))
};
