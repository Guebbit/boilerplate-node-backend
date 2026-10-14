/**
 * @module
 * The three collections this module owns. Rules live in `./service`. Every exported type is
 * written out because Mongoose's generics are too large for TypeScript to serialize an inferred
 * one at an export boundary (TS7056) — the same reason `Repository` exists.
 *
 * See: docs/modules/inventory.md
 */

import { Types } from 'mongoose';
import type { ClientSession, QueryFilter } from 'mongoose';
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
    type AppendOnlyLedger,
    type Lean,
    type Repository,
    type Wire
} from '@infrastructure/persistence/create-repository';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import type { CounterDelta, HoldKind } from './domain';
import { StockMovementReason, type StockMovement } from '@types';

/**
 * Which condition guards a given transition, in Mongo's own filter syntax. Kept here, not in
 * `services/` — `QueryFilter` stays a repository-only import, so a service can only ask this
 * module to move counters, never hand it a raw Mongo condition to run.
 *
 * Stays in step with `counterDeltaFor`'s reason→deltas table (`./domain`) by hand: a manual
 * invariant with no test of its own; `tests/unit/transitions.test.ts` covers `counterDeltaFor`
 * itself, not this. `ship` and `adjust` read `onHand`/`reserved` directly rather than
 * `available`, matching the invariant each protects: a dispatch must find both real, a correction
 * must not cut below what's promised.
 *
 * @param reason - the transition
 * @param quantity - how many units; signed only for `adjust`
 * @param kind - what the units are; a preorder claim is released against `preordered`, not `reserved`
 * @returns the Mongo condition `applyDelta` must match for the transition to apply
 */
const conditionFor = (
    reason: StockMovementReason,
    quantity: number,
    kind: HoldKind
): QueryFilter<StockLevelDocument> => {
    switch (reason) {
        case StockMovementReason.reserve: {
            return { available: { $gte: quantity } };
        }
        case StockMovementReason.ship: {
            return { onHand: { $gte: quantity }, reserved: { $gte: quantity } };
        }
        case StockMovementReason.release:
        case StockMovementReason.expire: {
            return kind === 'preorder'
                ? { preordered: { $gte: quantity } }
                : { reserved: { $gte: quantity } };
        }
        // The cap is the real ceiling, checked in the write's own filter like every other guard.
        // `$ifNull`: a level written before preorders existed has neither field.
        case StockMovementReason.preorder: {
            return {
                $expr: {
                    $lte: [
                        { $add: [{ $ifNull: ['$preordered', 0] }, quantity] },
                        { $ifNull: ['$preorderLimit', 0] }
                    ]
                }
            };
        }
        // The arrived units must exist and the claim must be there to convert.
        case StockMovementReason.allocate: {
            return { preordered: { $gte: quantity }, available: { $gte: quantity } };
        }
        case StockMovementReason.receive:
        case StockMovementReason.restock: {
            return {};
        }
        case StockMovementReason.adjust: {
            return { $expr: { $gte: [{ $add: ['$onHand', quantity] }, '$reserved'] } };
        }
    }
};

/**
 * One row of the stock board — this module's own counters ONLY, no product fields. The title a
 * board actually displays is `products`' to give out, not this module's to join for: see
 * `services/levels.ts`'s `listLevels`, which asks `productService.findManyByIds` for the page it just
 * read here — API composition rather than a database join across the module boundary.
 */
export interface StockLevelRow {
    productId: string;
    onHand: number;
    reserved: number;
    available: number;
    preorderLimit: number;
    preordered: number;
}

/** One row of the preorder board — counters only; the title and date are `products`' to give. */
export interface PreorderLevelRow {
    productId: string;
    preorderLimit: number;
    preordered: number;
    /** Lifetime units claimed, from the ledger's `preorder` rows. */
    ordered: number;
    /** Outstanding units on unpaid (`held`) holds. */
    held: number;
    /** Outstanding units on paid (`committed`) holds. */
    paid: number;
}

/**
 * Convert a hold's lines to storage shape.
 *
 * @param lines - the claimed products and quantities, ids as the service carries them
 * @returns the same lines with real `ObjectId`s
 */
const toReservationItems = (
    lines: readonly { productId: string; quantity: number; kind?: HoldKind }[]
): { productId: Types.ObjectId; quantity: number; kind: HoldKind }[] =>
    lines.map(({ productId, quantity, kind = 'stock' }) => ({
        productId: new Types.ObjectId(productId),
        quantity,
        kind
    }));

/**
 * Lifetime preorder units per product, from the ledger's `preorder` rows. Counts every claim, given
 * back or not: this is "how many were ever ordered", where `preordered` is "how many are still owed".
 *
 * @param productIds - the products on the page
 * @returns units by product id; absent for a product never preordered
 */
const orderedByProduct = (productIds: readonly Types.ObjectId[]): Promise<Map<string, number>> =>
    stockMovementModel
        .aggregate<{
            _id: Types.ObjectId;
            total: number;
        }>([
            { $match: { productId: { $in: productIds }, reason: StockMovementReason.preorder } },
            { $group: { _id: '$productId', total: { $sum: '$preorderedDelta' } } }
        ])
        .then((rows) => new Map(rows.map((row) => [String(row._id), row.total])));

/**
 * Outstanding preorder units per product, split by whether the order behind them is paid: a `held`
 * hold is unpaid, a `committed` one is paid and waiting for stock.
 *
 * @param productIds - the products on the page
 * @returns the split by product id; absent for a product with nothing outstanding on a hold
 */
const outstandingByProduct = (
    productIds: readonly Types.ObjectId[]
): Promise<Map<string, { held: number; paid: number }>> =>
    reservationModel
        .aggregate<{
            _id: { productId: Types.ObjectId; status: ReservationStatus };
            quantity: number;
        }>([
            {
                $match: {
                    status: { $in: ['held', 'committed'] },
                    'items.productId': { $in: productIds }
                }
            },
            { $unwind: '$items' },
            { $match: { 'items.kind': 'preorder', 'items.productId': { $in: productIds } } },
            {
                $group: {
                    _id: { productId: '$items.productId', status: '$status' },
                    quantity: { $sum: '$items.quantity' }
                }
            }
        ])
        .then((rows) => {
            const split = new Map<string, { held: number; paid: number }>();
            for (const { _id, quantity } of rows) {
                const key = String(_id.productId);
                const entry = split.get(key) ?? { held: 0, paid: 0 };
                if (_id.status === 'held') entry.held += quantity;
                else entry.paid += quantity;
                split.set(key, entry);
            }
            return split;
        });

/**
 * The stock level — one row per product, this module's only source of truth for `onHand`/
 * `reserved`/`available`. Every write is conditional; the service layer owns the per-transition
 * condition, this file only applies it and keeps `available` in step.
 */
export const stockLevelRepository: Repository<StockLevelDocument, Wire<StockLevelDocument>> & {
    insertIfAbsent: (productId: string, session?: ClientSession) => Promise<boolean>;
    findManyByProductIds: (productIds: readonly string[]) => Promise<StockLevelDocument[]>;
    findByProductId: (
        productId: string,
        session?: ClientSession
    ) => Promise<StockLevelDocument | null>;
    deleteByProductId: (productId: string) => Promise<void>;
    applyDelta: (
        productId: string,
        reason: StockMovementReason,
        quantity: number,
        delta: CounterDelta,
        session?: ClientSession,
        kind?: HoldKind
    ) => Promise<boolean>;
    setPreorderLimit: (productId: string, preorderLimit: number) => Promise<boolean>;
    preorderBoard: (options: {
        skip: number;
        limit: number;
    }) => Promise<{ items: PreorderLevelRow[]; totalItems: number }>;
    stockBoard: (options: {
        skip: number;
        limit: number;
        maxAvailable?: number;
    }) => Promise<{ items: StockLevelRow[]; totalItems: number }>;
    lowAvailabilityProductIds: (threshold: number) => Promise<string[]>;
    sumReserved: () => Promise<number>;
} = {
    ...createRepository<StockLevelDocument, Wire<StockLevelDocument>>(stockLevelModel, {
        transform: applyStockLevelTransform
    }),

    /**
     * Create the row at zero when absent, and say whether THIS call created it. The answer is what
     * lets a redelivered `PRODUCT_CREATED` book the opening stock only the first time. Racing twice
     * is safe: `productId`'s unique index makes the upsert a no-op the second time, and an existing
     * level is never overwritten. A product without a row yet genuinely has none, never a cached
     * count worth adopting — see `docs/modules/inventory.md#why-products-still-carries-a-copy`.
     *
     * @param productId - the product
     * @param session - the caller's transaction, so the insert and the stock booked after it commit together
     * @returns `true` when the row was inserted now, `false` when it was already there
     */
    insertIfAbsent: (productId: string, session?: ClientSession) =>
        stockLevelModel
            .updateOne(
                { productId: toObjectId(productId) },
                {
                    $setOnInsert: {
                        onHand: 0,
                        reserved: 0,
                        available: 0,
                        preorderLimit: 0,
                        preordered: 0
                    }
                },
                { upsert: true, session }
            )
            .exec()
            .then(({ upsertedCount }) => upsertedCount > 0),

    /**
     * One read for several products' levels.
     *
     * @param productIds - the products
     * @returns the levels that exist; a product with no row is simply absent
     */
    findManyByProductIds: (productIds: readonly string[]) =>
        stockLevelModel.find({ productId: { $in: productIds.map((id) => toObjectId(id)) } }).exec(),

    /**
     * @param productId - the product
     * @param session - the caller's transaction, so the read sees its own uncommitted writes
     * @returns its level, or `null` if it has none yet (never received, or the product is gone)
     */
    findByProductId: (productId: string, session?: ClientSession) =>
        stockLevelModel
            .findOne({ productId: toObjectId(productId) })
            .session(session ?? null)
            .exec(),

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
     * @param reason - the transition; decides the guard via `conditionFor`
     * @param quantity - how many units the transition guards for; signed only for `adjust`
     * @param delta - the columns `counterDeltaFor` computed for this transition
     * @param session - the caller's transaction, when the write belongs to one
     * @param kind - what the units are; `stock` unless the claim is a preorder's
     * @returns whether the condition matched and the counters actually moved
     */
    applyDelta: (
        productId: string,
        reason: StockMovementReason,
        quantity: number,
        delta,
        session?: ClientSession,
        kind: HoldKind = 'stock'
    ) =>
        stockLevelModel
            .updateOne(
                { productId: toObjectId(productId), ...conditionFor(reason, quantity, kind) },
                {
                    $inc: {
                        onHand: delta.onHandDelta,
                        reserved: delta.reservedDelta,
                        preordered: delta.preorderedDelta,
                        available: delta.onHandDelta - delta.reservedDelta
                    }
                },
                { timestamps: false, session }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * A page of the stock board, scarcest first — THIS module's rows alone, no join. Sorted on
     * `available` then `_id`: the `stocklevels_available__id` index already covers exactly this
     * order, and `_id` is what breaks a tie between two equally scarce products deterministically
     * (not alphabetically — `services/levels.ts`'s `listLevels` reads titles back from `products` AFTER
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
                available: row.available,
                preorderLimit: row.preorderLimit,
                preordered: row.preordered
            })),
            totalItems
        }));
    },

    /**
     * Set the allowance. Not a movement — nothing on the shelf changes — so it is a plain `$set`
     * with no ledger row; the admin door audits it. Creates the level when the product has none
     * yet, so a limit can be set before the first receipt.
     *
     * @param productId - the product
     * @param preorderLimit - the new allowance
     * @returns whether a level was written
     */
    setPreorderLimit: (productId, preorderLimit) =>
        stockLevelModel
            .updateOne(
                { productId: toObjectId(productId) },
                {
                    $set: { preorderLimit },
                    $setOnInsert: { onHand: 0, reserved: 0, available: 0, preordered: 0 }
                },
                { upsert: true }
            )
            .exec()
            .then(({ matchedCount, upsertedCount }) => matchedCount + upsertedCount > 0),

    /**
     * A page of the preorder board: every product with an allowance or something outstanding, the
     * most outstanding first. THIS module's counters, the ledger's lifetime count and the holds' paid
     * / unpaid split; the title and release date are `products`' to give.
     *
     * @param options - `skip`/`limit` for the page
     * @returns the page (titleless) and the count of everything matching
     */
    preorderBoard: ({ skip, limit }) => {
        const where: QueryFilter<StockLevelDocument> = {
            $or: [{ preorderLimit: { $gt: 0 } }, { preordered: { $gt: 0 } }]
        };

        return Promise.all([
            stockLevelModel
                .find(where)
                .sort({ preordered: -1, _id: 1 })
                .skip(skip)
                .limit(limit)
                .lean<Lean<StockLevelDocument>[]>()
                .exec(),
            stockLevelModel.countDocuments(where)
        ]).then(([rows, totalItems]) => {
            const ids = rows.map((row) => row.productId);
            return Promise.all([orderedByProduct(ids), outstandingByProduct(ids)]).then(
                ([ordered, outstanding]) => ({
                    items: rows.map((row) => {
                        const id = String(row.productId);
                        return {
                            productId: id,
                            preorderLimit: row.preorderLimit,
                            preordered: row.preordered,
                            ordered: ordered.get(id) ?? 0,
                            held: outstanding.get(id)?.held ?? 0,
                            paid: outstanding.get(id)?.paid ?? 0
                        };
                    }),
                    totalItems
                })
            );
        });
    },

    /**
     * Every product id at or under `threshold` available units — the low-stock gauge's OWN half
     * of the answer. Counts AVAILABILITY, not `onHand`: fully-reserved stock reads as out of
     * stock to a customer. Deliberately NOT the count itself, and no join into `products` to
     * apply its visibility rule here: `services/levels.ts`'s `lowStockCount` asks `productService`'s own
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
 * no update or delete, because a trail the application can edit is not a trail. Typed through
 * {@link AppendOnlyLedger} rather than the full `Repository`, so `deleteOne` is a compile error
 * for any caller, not just an unused method.
 */
export const stockMovementRepository: AppendOnlyLedger<StockMovementDocument, StockMovement> =
    createRepository<StockMovementDocument, StockMovement>(stockMovementModel, {
        transform: applyStockMovementTransform,
        searchable: {
            objectIds: { productId: 'productId' },
            // A closed vocabulary, matched verbatim: partial matching would let `re` pull back
            // `reserve`, `release` and `receive` at once and call the result a filtered view.
            exact: { reason: 'reason' }
        }
    });

/**
 * The hold. The generic CRUD surface plus the lifecycle primitives the service drives every
 * transition through (`insertHold`, `claimStatus`, `findExpired`) and the two refinements
 * (`narrowToTaken`, `extendExpiry`) — each documented at its own definition below.
 */
export const reservationRepository: Repository<ReservationDocument, Wire<ReservationDocument>> & {
    insertHold: (
        orderId: string,
        items: readonly { productId: string; quantity: number; kind?: HoldKind }[],
        expiresAt: Date
    ) => Promise<ReservationDocument | null>;
    findByOrderId: (orderId: string) => Promise<ReservationDocument | null>;
    claimStatus: (
        orderId: string,
        from: ReservationStatus,
        to: ReservationStatus,
        session?: ClientSession
    ) => Promise<ReservationDocument | null>;
    findOpenByOrderId: (
        orderId: string,
        session: ClientSession
    ) => Promise<ReservationDocument | null>;
    replaceItems: (
        orderId: string,
        items: readonly { productId: string; quantity: number; kind?: HoldKind }[],
        endsAs: ReservationStatus | undefined,
        session: ClientSession
    ) => Promise<ReservationDocument | null>;
    findPaidPreorderHolds: (
        productId: string,
        session: ClientSession
    ) => Promise<ReservationDocument[]>;
    findExpired: (now: Date, limit: number) => Promise<ReservationDocument[]>;
    narrowToTaken: (
        orderId: string,
        items: readonly { productId: string; quantity: number; kind?: HoldKind }[]
    ) => Promise<void>;
    extendExpiry: (orderId: string, expiresAt: Date) => Promise<ReservationDocument | null>;
} = {
    ...createRepository<ReservationDocument, Wire<ReservationDocument>>(reservationModel, {
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
     * @param session - the caller's transaction, when the claim belongs to one
     * @returns the updated hold, or `null` if another caller got there first
     */
    claimStatus: (
        orderId: string,
        from: ReservationStatus,
        to: ReservationStatus,
        session?: ClientSession
    ) =>
        reservationModel
            .findOneAndUpdate(
                { orderId: toObjectId(orderId), status: from },
                // The payment's instant is the preorder queue key, stamped in the claim itself.
                {
                    $set: { status: to, ...(to === 'committed' ? { committedAt: new Date() } : {}) }
                },
                // Return the post-update doc — caller needs the items it just claimed.
                { returnDocument: 'after', session }
            )
            .exec(),

    /**
     * The hold, but only while it still sets units aside (`held` or `committed`) — the read a
     * partial shipment or a remainder cancel starts from, inside its own transaction.
     *
     * @param orderId - the order
     * @param session - the caller's transaction
     * @returns the hold, or `null` when none is open
     */
    findOpenByOrderId: (orderId: string, session: ClientSession) =>
        reservationModel
            .findOne({ orderId: toObjectId(orderId), status: { $in: ['held', 'committed'] } })
            .session(session)
            .exec(),

    /**
     * Rewrite an open hold's items after some left it, optionally ending the hold in the same
     * write. Conditional on the hold still being open, so a racing cancel that already released it
     * matches nothing.
     *
     * @param orderId - the order
     * @param items - what the hold still sets aside
     * @param endsAs - the terminal status to write when nothing is left, else `undefined`
     * @param session - the caller's transaction
     * @returns the hold as it now stands, or `null` if it was no longer open
     */
    replaceItems: (orderId, items, endsAs, session) =>
        reservationModel
            .findOneAndUpdate(
                { orderId: toObjectId(orderId), status: { $in: ['held', 'committed'] } },
                {
                    $set: {
                        items: toReservationItems(items),
                        ...(endsAs ? { status: endsAs } : {})
                    }
                },
                { returnDocument: 'after', session }
            )
            .exec(),

    /**
     * The paid holds that still wait for stock of one product, oldest payment first — the queue a
     * receipt allocates down. A `held` hold is unpaid and is not in it: its units free themselves
     * when the window closes.
     *
     * @param productId - the product whose stock arrived
     * @param session - the receipt's transaction, so the read sees what it has already allocated
     * @returns the holds in queue order, ties broken by id so the order is stable
     */
    findPaidPreorderHolds: (productId, session) =>
        reservationModel
            .find({
                status: 'committed',
                items: { $elemMatch: { productId: toObjectId(productId), kind: 'preorder' } }
            })
            .sort({ committedAt: 1, _id: 1 })
            .session(session)
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
            .exec(),

    /**
     * Rewrite a still-held hold's item list to only what a partial reserve actually took, before
     * the caller releases those and deletes the hold — so a crash between this write and the
     * delete leaves a hold naming real reservations, never lines whose counters were never moved.
     * Guarded on `status: 'held'`: if another caller already claimed the hold, its items are
     * mid-use and this leaves them alone rather than racing that claim.
     *
     * @param orderId - the order whose hold is being narrowed
     * @param items - the lines actually taken before the failure
     */
    narrowToTaken: (
        orderId: string,
        items: readonly { productId: string; quantity: number; kind?: HoldKind }[]
    ) =>
        reservationModel
            .updateOne(
                { orderId: toObjectId(orderId), status: 'held' },
                { $set: { items: toReservationItems(items) } }
            )
            .exec()
            .then(() => undefined),

    /**
     * Push a still-`held` hold's deadline out — a card payment gone `processing` can take days to
     * settle, and the sweep must not cancel an order whose money is still genuinely on its way.
     * Guarded on `status: 'held'`: a hold already claimed has no deadline left to move.
     *
     * @param orderId - the order whose hold is still open
     * @param expiresAt - the new deadline
     * @returns the updated hold, or `null` if it is no longer `held`
     */
    extendExpiry: (orderId: string, expiresAt: Date) =>
        reservationModel
            .findOneAndUpdate(
                { orderId: toObjectId(orderId), status: 'held' },
                { $set: { expiresAt } },
                { returnDocument: 'after' }
            )
            .exec()
};
