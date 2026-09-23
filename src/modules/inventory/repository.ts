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
    type Lean,
    type Repository
} from '@infrastructure/persistence/create-repository';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import type { CounterDelta } from './domain';

/**
 * One row of the stock board — this module's own counters ONLY, no product fields. The title a
 * board actually displays is `products`' to give out, not this module's to join for: see
 * `service.ts`'s `listLevels`, which asks `productService.findManyByIds` for the page it just
 * read here — API composition rather than a database join across the module boundary.
 */
export interface StockLevelRow {
    productId: string;
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
    ensure: (productId: string) => Promise<StockLevelDocument>;
    findByProductId: (productId: string) => Promise<StockLevelDocument | null>;
    deleteByProductId: (productId: string) => Promise<void>;
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
    lowAvailabilityProductIds: (threshold: number) => Promise<string[]>;
    sumReserved: () => Promise<number>;
} = {
    ...createRepository<StockLevelDocument>(stockLevelModel, {
        transform: applyStockLevelTransform
    }),

    /**
     * The opening-stock write: create the row at zero if the product has never had one, otherwise
     * leave it — never overwrite an existing level. Racing twice (a redelivered `PRODUCT_CREATED`)
     * is safe because `productId`'s unique index makes the upsert a no-op the second time. A
     * product without a row yet genuinely has none, never a cached count worth adopting — see
     * `docs/modules/inventory.md#why-products-still-carries-a-copy`. The listener's own real
     * opening-quantity write (a separate `receive` call) is not covered by this guarantee.
     *
     * @param productId - the product
     * @returns the row, new or already there
     */
    ensure: (productId: string) =>
        stockLevelModel
            .findOneAndUpdate(
                { productId: toObjectId(productId) },
                { $setOnInsert: { onHand: 0, reserved: 0, available: 0 } },
                { upsert: true, returnDocument: 'after' }
            )
            .exec(),

    /**
     * @param productId - the product
     * @returns its level, or `null` if it has none yet (never received, or the product is gone)
     */
    findByProductId: (productId: string) =>
        stockLevelModel.findOne({ productId: toObjectId(productId) }).exec(),

    /**
     * Erase a product's level row outright — the hard-delete cascade's own half. Never called for
     * a soft delete or its restore: those must find the counters exactly where they left them.
     * `stockmovements` is deliberately untouched — the ledger is history, and a deleted product's
     * past receipts and sales stay true regardless of whether anything still reads its counters.
     *
     * @param productId - the product just hard-deleted
     */
    deleteByProductId: (productId: string): Promise<void> =>
        stockLevelModel
            .deleteOne({ productId: toObjectId(productId) })
            .exec()
            .then(() => undefined),

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
     * A page of the stock board, scarcest first — THIS module's rows alone, no join. Sorted on
     * `available` then `_id`: the `stocklevels_available__id` index already covers exactly this
     * order, and `_id` is what breaks a tie between two equally scarce products deterministically
     * (not alphabetically — `service.ts`'s `listLevels` reads titles back from `products` AFTER
     * this page is settled, which is one round trip too late to sort by them). See
     * `docs/theory/strategic-ddd.md` §5: the board reads the real counters, and
     * asks `products` for names through its service, never through a database join.
     *
     * @param options - `skip`/`limit` for the page, and `maxAvailable` to keep only scarce rows
     * @returns the page (titleless) and the count of everything matching
     */
    stockBoard: ({ skip, limit, maxAvailable }) => {
        const where: QueryFilter<StockLevelDocument> =
            maxAvailable === undefined ? {} : { available: { $lte: maxAvailable } };

        return Promise.all([
            stockLevelModel
                .find({ ...where })
                .sort({ available: 1, _id: 1 })
                .skip(skip)
                .limit(limit)
                .lean<Lean<StockLevelDocument>[]>()
                .exec(),
            stockLevelModel.countDocuments({ ...where })
        ]).then(([rows, totalItems]) => ({
            items: rows.map((row) => ({
                productId: String(row.productId),
                onHand: row.onHand,
                reserved: row.reserved,
                available: row.available
            })),
            totalItems
        }));
    },

    /**
     * Every product id at or under `threshold` available units — the low-stock gauge's OWN half
     * of the answer. Counts AVAILABILITY, not `onHand`: fully-reserved stock reads as out of
     * stock to a customer. Deliberately NOT the count itself, and no join into `products` to
     * apply its visibility rule here: `service.ts`'s `lowStockCount` asks `productService`'s own
     * `countPublic` for that half, the same API-composition shape `stockBoard` uses.
     *
     * @param threshold - the low-availability mark
     * @returns the candidate product ids, unfiltered by visibility
     */
    lowAvailabilityProductIds: (threshold: number) =>
        stockLevelModel
            .find({ available: { $lte: threshold } })
            .lean<Lean<StockLevelDocument>[]>()
            .exec()
            .then((rows) => rows.map((row) => String(row.productId))),

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
            .catch((error: unknown) => {
                if (isDuplicateKey(error)) return null;
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
