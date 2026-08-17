import { Types } from 'mongoose';
import {
    stockMovementModel,
    applyStockMovementTransform,
    reservationModel,
    applyReservationTransform,
    type StockMovementDocument,
    type ReservationDocument,
    type ReservationStatus
} from './model';
import {
    createBaseRepository,
    toObjectId,
    type BaseRepository
} from '@infrastructure/persistence/base-repository';

/**
 * The two collections this module owns. Rules live in `./service`; the counters these coordinate
 * with belong to `@modules/products`.
 *
 * Both types are written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `BaseRepository` exists.
 */

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
 * The ledger. Append-only: the base factory's `create` and `search` are the whole surface, and
 * there is deliberately no update or delete — a trail the application can edit is not a trail.
 *
 * `search` is inherited rather than replaced by a "latest N" read. A stock ledger is the record an
 * auditor works through, so it pages like every other collection here and reports `totalItems`
 * alongside the page: a read that silently returned only the newest rows would misreport history
 * as complete.
 */
export const stockMovementRepository: BaseRepository<StockMovementDocument> =
    createBaseRepository<StockMovementDocument>(stockMovementModel, {
        transform: applyStockMovementTransform,
        searchable: {
            objectIds: { productId: 'productId' },
            // A closed vocabulary, matched verbatim: partial matching would let `re` pull back
            // `reserve`, `release` and `receive` at once and call the result a filtered view.
            exact: { reason: 'reason' }
        }
    });

export const reservationRepository: BaseRepository<ReservationDocument> & {
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
    ...createBaseRepository<ReservationDocument>(reservationModel, {
        transform: applyReservationTransform
    }),

    /**
     * Open a hold for an order.
     *
     * The unique index on `orderId` is what detects a duplicate, so two simultaneous checkouts for
     * one order cannot both see "no hold yet". A duplicate is a retry, not a fault, so it is
     * answered rather than thrown; Mongo signals it as code 11000 and anything else is rethrown.
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
                if (error?.code === 11_000) return null;
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
     * Move a hold between statuses, and answer whether THIS call is the one that moved it.
     *
     * The module's exactly-once primitive. Naming the status it comes FROM means exactly one of N
     * concurrent callers matches — a cancel racing the sweep, a webhook delivered twice — and the
     * losers correctly do nothing. `findOneAndUpdate` because the winner needs the items it is
     * about to give back or take away.
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
                { returnDocument: 'after' }
            )
            .exec(),

    /**
     * Holds whose window has closed, oldest deadline first.
     *
     * Capped rather than unbounded so one sweep cannot try to cancel every stale order in a
     * single request. Truncation is safe here and not in the ledger read: the sweep is idempotent
     * and reports when it hit the cap, so the work is resumed rather than lost.
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
