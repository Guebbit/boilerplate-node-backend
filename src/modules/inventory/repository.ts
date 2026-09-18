/**
 * @module
 * The three collections this module owns. Rules live in `./service`. Every exported type is
 * written out because Mongoose's generics are too large for TypeScript to serialize an inferred
 * one at an export boundary (TS7056) — the same reason `Repository` exists.
 *
 * See: docs/modules/inventory.md
 */

import { Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import {
    stockLevelModel,
    applyStockLevelTransform,
    stockMovementModel,
    applyStockMovementTransform,
    reservationModel,
    applyReservationTransform,
    type StockLevelDocument,
    type StockMovementDocument,
    type ReservationDocument,
    type ReservationStatus
} from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import type { CounterDelta } from './domain';

/** One row of the stock board, joined with the product's title for display. */
export interface StockLevelRow {
    productId: string;
    title: string;
    onHand: number;
    reserved: number;
    available: number;
}

/**
 * Convert a hold's lines to storage shape.
 *
 * @param lines - the claimed products and quantities, ids as the service carries them
 * @returns the same lines with real `ObjectId`s
 */
const toReservationItems = (
    lines: readonly { productId: string; quantity: number }[]
): { productId: Types.ObjectId; quantity: number }[] =>
    lines.map(({ productId, quantity }) => ({
        productId: new Types.ObjectId(productId),
        quantity
    }));

/**
 * The stock level — one row per product, this module's only source of truth for `onHand`/
 * `reserved`/`available`. Every write is conditional; the service layer owns the per-transition
 * condition, this file only applies it and keeps `available` in step.
 */
export const stockLevelRepository: Repository<StockLevelDocument> & {
    ensure: (
        productId: string,
        seed?: { onHand: number; reserved: number }
    ) => Promise<StockLevelDocument>;
    findByProductId: (productId: string) => Promise<StockLevelDocument | null>;
    findManyByProductIds: (productIds: readonly string[]) => Promise<StockLevelDocument[]>;
    applyDelta: (
        productId: string,
        condition: QueryFilter<StockLevelDocument>,
        delta: CounterDelta
    ) => Promise<boolean>;
    stockBoard: (options: {
        skip: number;
        limit: number;
        maxAvailable?: number;
    }) => Promise<{ items: StockLevelRow[]; totalItems: number }>;
    countLowAvailability: (threshold: number) => Promise<number>;
    sumReserved: () => Promise<number>;
} = {
    ...createRepository<StockLevelDocument>(stockLevelModel, {
        transform: applyStockLevelTransform
    }),

    /**
     * The opening-stock write: create the row if the product has never had one, otherwise leave
     * it — never overwrite an existing level. Racing twice (a redelivered `PRODUCT_CREATED`) is
     * safe because `productId`'s unique index refuses the second insert.
     *
     * @param productId - the product
     * @param seed - what to start a NEW row at; ignored if one already exists. The service layer
     *   passes the product's own cached counters, so a product whose document predates this
     *   collection (or a test fixture that wrote the cache directly) is adopted correctly on its
     *   first transition, rather than resetting to zero under it.
     * @returns the row, new or already there
     */
    ensure: (productId: string, seed?: { onHand: number; reserved: number }) => {
        const onHand = seed?.onHand ?? 0;
        const reserved = seed?.reserved ?? 0;
        return stockLevelModel
            .findOneAndUpdate(
                { productId: toObjectId(productId) },
                {
                    $setOnInsert: {
                        onHand,
                        reserved,
                        available: Math.max(0, onHand - reserved)
                    }
                },
                { upsert: true, returnDocument: 'after' }
            )
            .exec();
    },

    /**
     * @param productId - the product
     * @returns its level, or `null` if it has none yet (never received, or the product is gone)
     */
    findByProductId: (productId: string) =>
        stockLevelModel.findOne({ productId: toObjectId(productId) }).exec(),

    /**
     * @param productIds - the products
     * @returns whichever of them have a level row, in no particular order
     */
    findManyByProductIds: (productIds: readonly string[]) =>
        stockLevelModel.find({ productId: { $in: productIds.map((id) => toObjectId(id)) } }).exec(),

    /**
     * Move one product's counters, or none of them — the module's one write primitive.
     *
     * `available` is kept in step in the SAME `$inc`, not recomputed afterward: `onHandDelta -
     * reservedDelta` is always the right change to it, whatever the transition, so no caller has
     * to restate the arithmetic `counterDeltaFor` already decided.
     *
     * @param productId - the product whose counters move
     * @param condition - the transition's own guard, `productId` and `available`/`onHand`/
     *   `reserved` comparisons — the service layer decides what each transition requires
     * @param delta - the pair `counterDeltaFor` computed for this transition
     * @returns whether the condition matched and the counters actually moved
     */
    applyDelta: (productId: string, condition: QueryFilter<StockLevelDocument>, delta) =>
        stockLevelModel
            .updateOne(
                { productId: toObjectId(productId), ...condition },
                {
                    $inc: {
                        onHand: delta.onHandDelta,
                        reserved: delta.reservedDelta,
                        available: delta.onHandDelta - delta.reservedDelta
                    }
                },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * A page of the stock board, scarcest first, `title` breaking a tie the same way
     * `products`' old `availabilityPage` did (so a page boundary cannot show one product twice and
     * another not at all). `available: { $lte: maxAvailable }` still narrows through the stored,
     * indexed `available` column before the join — only the final tie-break sort runs over the
     * narrowed set, in memory, and only on this admin-only, low-frequency endpoint; the constraint
     * this module exists to satisfy is about the storefront catalogue read, not this one.
     *
     * @param options - `skip`/`limit` for the page, and `maxAvailable` to keep only scarce rows
     * @returns the page and the count of everything matching
     */
    stockBoard: ({ skip, limit, maxAvailable }) =>
        stockLevelModel
            .aggregate<{ items: StockLevelRow[]; total: { count: number }[] }>([
                ...(maxAvailable === undefined
                    ? []
                    : [{ $match: { available: { $lte: maxAvailable } } }]),
                {
                    $lookup: {
                        from: 'products',
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $facet: {
                        items: [
                            { $sort: { available: 1, 'product.title': 1, _id: 1 } },
                            { $skip: skip },
                            { $limit: limit },
                            {
                                $project: {
                                    _id: 0,
                                    productId: { $toString: '$productId' },
                                    title: '$product.title',
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
     * How many PUBLICLY VISIBLE products a buyer would find at or under `threshold` units. Counts
     * AVAILABILITY, not `onHand` — fully-reserved stock reads as out of stock to a customer. Joins
     * `products` to apply the same visibility scope `productRepository.publicScope()` defines
     * (`active: true`, not soft-deleted) — duplicated here rather than threaded through a service
     * call, the same trade this codebase already makes for `cart/domain/rules.ts`'s
     * `availableUnits`; both are two conditions, not a rule likely to drift unnoticed.
     *
     * @param threshold - the low-availability mark
     * @returns how many publicly visible products are at or under it
     */
    countLowAvailability: (threshold: number) =>
        stockLevelModel
            .aggregate<{ count: number }>([
                { $match: { available: { $lte: threshold } } },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                { $match: { 'product.active': true, 'product.deletedAt': { $exists: false } } },
                { $count: 'count' }
            ])
            .then((results) => results.at(0)?.count ?? 0),

    /**
     * Every unit currently promised to an open order, across the whole catalogue.
     *
     * @returns the total reserved units
     */
    sumReserved: () =>
        stockLevelModel
            .aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$reserved' } } }])
            .then((results) => results.at(0)?.total ?? 0)
};

/**
 * The ledger. Append-only: `create` and `search` are the whole surface — there is deliberately
 * no update or delete, because a trail the application can edit is not a trail.
 */
export const stockMovementRepository: Repository<StockMovementDocument> =
    createRepository<StockMovementDocument>(stockMovementModel, {
        transform: applyStockMovementTransform,
        searchable: {
            objectIds: { productId: 'productId' },
            // A closed vocabulary, matched verbatim: partial matching would let `re` pull back
            // `reserve`, `release` and `receive` at once and call the result a filtered view.
            exact: { reason: 'reason' }
        }
    });

/**
 * The hold. The generic CRUD surface plus the four lifecycle primitives the service drives every
 * transition through — each documented at its own definition below.
 */
export const reservationRepository: Repository<ReservationDocument> & {
    insertHold: (
        orderId: string,
        items: readonly { productId: string; quantity: number }[],
        expiresAt: Date
    ) => Promise<ReservationDocument | null>;
    findByOrderId: (orderId: string) => Promise<ReservationDocument | null>;
    claimStatus: (
        orderId: string,
        from: ReservationStatus,
        to: ReservationStatus
    ) => Promise<ReservationDocument | null>;
    findExpired: (now: Date, limit: number) => Promise<ReservationDocument[]>;
} = {
    ...createRepository<ReservationDocument>(reservationModel, {
        transform: applyReservationTransform
    }),

    /**
     * The unique index on `orderId` answers a duplicate rather than throwing — two racing
     * checkouts for one order cannot both see "no hold yet". Mongo signals it as code 11000.
     *
     * @param orderId - the order the hold belongs to
     * @param items - what it claims
     * @param expiresAt - when the hold stops being honoured
     * @returns the new hold, or `null` if this order already had one
     */
    insertHold: (orderId, items, expiresAt) =>
        reservationModel
            .create({
                orderId: toObjectId(orderId),
                items: toReservationItems(items),
                status: 'held',
                expiresAt
            })
            .then((reservation): ReservationDocument | null => reservation)
            .catch((error: { code?: number }) => {
                if (error.code === 11_000) return null;
                throw error;
            }),

    /**
     * Read an order's hold, whatever state it is in.
     *
     * @param orderId - the order
     * @returns the hold, or `null` if the order never had one
     */
    findByOrderId: (orderId: string) =>
        reservationModel.findOne({ orderId: toObjectId(orderId) }).exec(),

    /**
     * The module's exactly-once primitive: naming the FROM status means only one of N concurrent
     * callers can match, so a racing cancel, sweep, or duplicate webhook loses cleanly.
     *
     * @param orderId - the order whose hold is being claimed
     * @param from - the status the hold must currently be in
     * @param to - the status to move it to
     * @returns the updated hold, or `null` if another caller got there first
     */
    claimStatus: (orderId: string, from: ReservationStatus, to: ReservationStatus) =>
        reservationModel
            .findOneAndUpdate(
                { orderId: toObjectId(orderId), status: from },
                { $set: { status: to } },
                // Return the post-update doc — caller needs the items it just claimed.
                { returnDocument: 'after' }
            )
            .exec(),

    /**
     * Capped so one sweep can't try to cancel every stale order in a single request —
     * truncation is safe because the sweep is idempotent and reports when it hits the cap.
     *
     * @param now - the moment to measure deadlines against
     * @param limit - how many to return at most
     * @returns the expired holds
     */
    findExpired: (now: Date, limit: number) =>
        reservationModel
            .find({ status: 'held', expiresAt: { $lte: now } })
            .sort({ expiresAt: 1 })
            .limit(limit)
            .exec()
};
