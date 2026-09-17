/**
 * @module
 * The two collections this module owns. Rules live in `./service`; the counters these coordinate
 * with belong to `@modules/products`. Both types are written out because Mongoose's generics are
 * too large for TypeScript to serialize an inferred one at an export boundary (TS7056) — the same
 * reason `Repository` exists.
 *
 * See: docs/modules/inventory.md
 */

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
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';

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
