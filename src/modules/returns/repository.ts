/**
 * @module
 * Return persistence: the generic CRUD surface plus the two primitives the service drives every
 * lifecycle move through — `claimStatus`, the conditional write that makes a decision exactly-once,
 * and the per-order reads the quantity check needs.
 */

import type { ClientSession } from 'mongoose';
import { returnModel, applyReturnTransform } from './model';
import type { ReturnDocument } from './model';
import type { ReturnStatus } from './domain';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import type { Return } from '@types';

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
    findByOrderId: (orderId: string) => Promise<ReturnDocument[]>;
    findByOrderIds: (orderIds: readonly string[]) => Promise<ReturnDocument[]>;
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
     */
    findByOrderId: (orderId) =>
        returnModel
            .find({ orderId: toObjectId(orderId) })
            .sort({ createdAt: 1, _id: 1 })
            .exec(),

    /**
     * Every return on any of these orders, oldest first — the account export's read.
     * @param orderIds - the orders
     */
    findByOrderIds: (orderIds) =>
        returnModel
            .find({ orderId: { $in: orderIds.map((id) => toObjectId(id)) } })
            .sort({ createdAt: 1, _id: 1 })
            .exec()
};
