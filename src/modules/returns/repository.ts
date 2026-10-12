/**
 * @module
 * Return persistence: the generic CRUD surface plus the two primitives the service drives every
 * lifecycle move through — `claimStatus`, the conditional write that makes a decision exactly-once,
 * and the per-order reads the quantity check needs.
 */

import type { ClientSession, PipelineStage, Types } from 'mongoose';
import { returnModel, returnOrderLockModel, applyReturnTransform } from './model';
import type { ReturnDocument } from './model';
import type { ReturnStatus } from './domain';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import type { Return } from '@types';
import type { ReportWindow } from '@infrastructure/persistence/report';

/** The fields a lifecycle move may stamp in the same write as its status. */
export type ReturnStamp = Partial<
    Pick<
        ReturnDocument,
        | 'declineReason'
        | 'decidedAt'
        | 'receivedAt'
        | 'handlingDeduction'
        | 'refundAmount'
        | 'closedAt'
    >
>;

/** Return CRUD, plus the conditional status move and the per-order reads. */
export const returnRepository: Repository<ReturnDocument, Return> & {
    claimStatus: (
        id: string,
        from: readonly ReturnStatus[],
        to: ReturnStatus,
        stamp?: ReturnStamp,
        session?: ClientSession
    ) => Promise<ReturnDocument | null>;
    findByOrderId: (orderId: string, session?: ClientSession) => Promise<ReturnDocument[]>;
    lockOrder: (orderId: string, session: ClientSession) => Promise<void>;
    findByOrderIds: (orderIds: readonly string[]) => Promise<ReturnDocument[]>;
    scrubFreeTextBefore: (cutoff: Date) => Promise<number>;
    sumReceived: <TRow>(
        window: ReportWindow,
        group: PipelineStage.Group['$group'],
        productId?: Types.ObjectId
    ) => Promise<TRow[]>;
} = {
    ...createRepository<ReturnDocument, Return>(returnModel, {
        transform: applyReturnTransform,
        searchable: {
            objectIds: { orderId: 'orderId' },
            exact: { status: 'status', reason: 'reason' }
        }
    }),

    /**
     * Move a return between statuses, but only from one of the expected ones — atomically. The
     * `$in` rides in the filter, not a preceding read, so two staff members deciding the same
     * request race in the database and exactly one write matches; the loser gets `null`.
     *
     * @param id - the return
     * @param from - the statuses this move may start from
     * @param to - the status being written
     * @param stamp - facts that belong to this move, written in the SAME statement
     * @param session - the caller's transaction, when this move belongs to one (receiving goods
     *   moves the status and the stock together)
     * @returns the return as it now stands, or `null` if it was not in `from`
     */
    claimStatus: (id, from, to, stamp = {}, session) =>
        returnModel
            .findOneAndUpdate(
                { _id: toObjectId(id), status: { $in: [...from] } },
                { $set: { status: to, ...stamp } },
                { returnDocument: 'after', session }
            )
            .exec(),

    /**
     * Every return on one order, oldest first.
     * @param orderId - the order
     * @param session - the caller's transaction, when the read belongs to one
     */
    findByOrderId: (orderId, session) =>
        returnModel
            .find({ orderId: toObjectId(orderId) })
            .sort({ createdAt: 1, _id: 1 })
            .session(session ?? null)
            .exec(),

    /**
     * Take the order's lock row: two transactions that both call this for one order conflict on the
     * write, and the driver re-runs the loser after the winner commits. Upserted, so the first
     * opening creates the row.
     * @param orderId - the order whose returns are about to be read and written
     * @param session - the opening's transaction; a lock outside one would lock nothing
     */
    lockOrder: (orderId, session) =>
        returnOrderLockModel
            .findOneAndUpdate(
                { _id: toObjectId(orderId) },
                { $inc: { openings: 1 } },
                { upsert: true, session }
            )
            .exec()
            .then(() => undefined),

    /**
     * Returns whose goods were received in the window, one row per returned line, grouped as the
     * caller says — the stats' read. `received` and `closed` both hold goods that came back.
     *
     * @param window - receivedAt bounds
     * @param group - the `$group` stage's body, over `$lines.*` and the return's own fields
     * @param productId - only lines of this product
     */
    sumReceived: <TRow>(
        window: ReportWindow,
        group: PipelineStage.Group['$group'],
        productId?: Types.ObjectId
    ) =>
        returnModel
            .aggregate<TRow>([
                {
                    $match: {
                        status: { $in: ['received', 'closed'] },
                        receivedAt: { $gte: window.from, $lt: window.to }
                    }
                },
                { $unwind: '$lines' },
                ...(productId ? [{ $match: { 'lines.productId': productId } }] : []),
                { $group: group }
            ])
            .exec(),

    /**
     * Every return on any of these orders, oldest first — the account export's read.
     * @param orderIds - the orders
     */
    findByOrderIds: (orderIds) =>
        returnModel
            .find({ orderId: { $in: orderIds.map((id) => toObjectId(id)) } })
            .sort({ createdAt: 1, _id: 1 })
            .exec(),

    /**
     * Unset the free text (`note`, `declineReason`) on every return not changed since `cutoff` that
     * still holds some. The filter only matches returns that still hold text, so a rerun matches
     * nothing. `timestamps: false` keeps the wipe from moving `updatedAt`, the very clock this
     * query reads.
     *
     * Mongoose `updateMany` options: https://mongoosejs.com/docs/api/query.html#Query.prototype.updateMany()
     *
     * @param cutoff - returns with `updatedAt` at or before this are wiped
     * @returns how many returns lost text
     */
    scrubFreeTextBefore: (cutoff) =>
        returnModel
            .updateMany(
                {
                    updatedAt: { $lte: cutoff },
                    $or: [{ note: { $exists: true } }, { declineReason: { $exists: true } }]
                },
                { $unset: { note: 1, declineReason: 1 } },
                { timestamps: false }
            )
            .exec()
            .then((result) => result.modifiedCount)
};
