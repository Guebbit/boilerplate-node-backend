/**
 * @module
 * Delivery persistence — the two collections and the conditional writes every act is driven
 * through. The return types are written out because Mongoose's generics are too large for
 * TypeScript to serialize an inferred one at an export boundary (TS7056), the same reason
 * `Repository` exists. See: docs/modules/delivery.md
 */

import type { ClientSession } from 'mongoose';
import {
    fulfillmentOrderModel,
    shipmentModel,
    applyFulfillmentOrderTransform,
    applyShipmentTransform
} from './model';
import type { FulfillmentOrderDocument, ShipmentDocument } from './model';
import type { FulfillmentOrderDraft } from './domain';
import { FulfillmentConsent, FulfillmentHoldReason, FulfillmentOrderStatus } from '@types';
import {
    createRepository,
    toObjectId,
    type Repository,
    type Wire
} from '@infrastructure/persistence/create-repository';

/** What an act changes on a fulfillment order, written under a revision claim. */
export type FulfillmentOrderPatch = Partial<
    Pick<
        FulfillmentOrderDocument,
        | 'lines'
        | 'status'
        | 'holdReason'
        | 'holdNote'
        | 'expectedAt'
        | 'consent'
        | 'consentDeadline'
        | 'lastNoticeAt'
        | 'slips'
        | 'cancelReason'
    >
> & {
    /** Fields to remove — a released hold carries no reason or note, a confirmed wait no deadline. */
    unset?: readonly ('holdReason' | 'holdNote' | 'consentDeadline')[];
};

/** The shared factory's CRUD surface plus the fulfillment order's own reads and claims. */
export const fulfillmentOrderRepository: Repository<
    FulfillmentOrderDocument,
    Wire<FulfillmentOrderDocument>
> & {
    findByOrderId: (
        orderId: string,
        session?: ClientSession
    ) => Promise<FulfillmentOrderDocument[]>;
    findByOrderIds: (orderIds: readonly string[]) => Promise<FulfillmentOrderDocument[]>;
    findInSession: (id: string, session: ClientSession) => Promise<FulfillmentOrderDocument | null>;
    insertIfAbsent: (
        orderId: string,
        draft: FulfillmentOrderDraft,
        session: ClientSession
    ) => Promise<void>;
    claim: (
        id: string,
        revision: number,
        patch: FulfillmentOrderPatch,
        session: ClientSession
    ) => Promise<FulfillmentOrderDocument | null>;
    scrubHoldNotesBefore: (cutoff: Date) => Promise<number>;
    findWaitingForProduct: (productId: string) => Promise<FulfillmentOrderDocument[]>;
    findDatePassed: (now: Date) => Promise<FulfillmentOrderDocument[]>;
    findWaitsExpired: (now: Date) => Promise<FulfillmentOrderDocument[]>;
} = {
    ...createRepository<FulfillmentOrderDocument, Wire<FulfillmentOrderDocument>>(
        fulfillmentOrderModel,
        { transform: applyFulfillmentOrderTransform }
    ),

    /**
     * Every fulfillment order of one order, in number order — the caller's read, and the input of
     * the summary an act recomputes.
     * @param orderId - the order
     * @param session - the act's transaction, when the read belongs to one
     */
    findByOrderId: (orderId, session) =>
        fulfillmentOrderModel
            .find({ orderId: toObjectId(orderId) })
            .sort({ number: 1 })
            .session(session ?? null)
            .exec(),

    /**
     * Every fulfillment order behind a set of orders, in one query — the account export, joined
     * onto the caller's own orders.
     * @param orderIds - the orders
     */
    findByOrderIds: (orderIds) =>
        fulfillmentOrderModel
            .find({ orderId: { $in: orderIds.map((id) => toObjectId(id)) } })
            .sort({ orderId: 1, number: 1 })
            .exec(),

    /**
     * One fulfillment order read inside an act's transaction.
     * @param id - the fulfillment order
     * @param session - the act's transaction
     */
    findInSession: (id, session) =>
        fulfillmentOrderModel.findById(toObjectId(id)).session(session).exec(),

    /**
     * Make a fulfillment order unless its `{ orderId, number }` already exists — what makes "made
     * when the order is paid" idempotent. `$setOnInsert` never touches an existing document, so a
     * retried listener or a read racing it leaves what is there alone.
     *
     * Mongoose `updateOne` with `upsert`: https://mongoosejs.com/docs/api/model.html#Model.updateOne()
     * @param orderId - the order
     * @param draft - the fulfillment order the grouping rule made
     * @param session - the act's transaction
     */
    insertIfAbsent: (orderId, draft, session) =>
        fulfillmentOrderModel
            .updateOne(
                { orderId: toObjectId(orderId), number: draft.number },
                {
                    $setOnInsert: {
                        orderId: toObjectId(orderId),
                        number: draft.number,
                        kind: draft.kind,
                        status: draft.status,
                        lines: draft.lines,
                        revision: 0,
                        ...(draft.holdReason ? { holdReason: draft.holdReason } : {}),
                        ...(draft.agreedAt ? { agreedAt: draft.agreedAt } : {}),
                        ...(draft.expectedAt ? { expectedAt: draft.expectedAt } : {}),
                        slips: 0
                    }
                },
                { upsert: true, session }
            )
            .exec()
            .then(() => undefined),

    /**
     * Write a change to a fulfillment order, but only if nobody else has since the caller read it —
     * the match is on `revision`, in the filter, so two acts racing the same remainder cannot both
     * land: the loser matches nothing and gets `null`.
     * @param id - the fulfillment order
     * @param revision - the revision the caller read
     * @param patch - the change; `unset` names fields to remove
     * @param session - the act's transaction
     * @returns the fulfillment order as it now stands, or `null` when it moved since the read
     */
    claim: (id, revision, { unset, ...fields }, session) =>
        fulfillmentOrderModel
            .findOneAndUpdate(
                { _id: toObjectId(id), revision },
                {
                    $set: fields,
                    $inc: { revision: 1 },
                    ...(unset?.length
                        ? { $unset: Object.fromEntries(unset.map((field) => [field, 1])) }
                        : {})
                },
                { returnDocument: 'after', session }
            )
            .exec(),

    /**
     * Every fulfillment order still waiting for stock that holds this product — the ones a moved
     * release date concerns. Served by the `status + holdReason + lines.productId` index.
     * @param productId - the product whose release date moved
     */
    findWaitingForProduct: (productId) =>
        fulfillmentOrderModel
            .find({
                status: FulfillmentOrderStatus.on_hold,
                holdReason: FulfillmentHoldReason.awaiting_stock,
                'lines.productId': productId
            })
            .exec(),

    /**
     * The waiting fulfillment orders whose expected date has come, for the sweep to judge against
     * their last notice (a date alone cannot say whether the buyer was already told).
     * @param now - the instant of the sweep
     */
    findDatePassed: (now) =>
        fulfillmentOrderModel
            .find({
                status: FulfillmentOrderStatus.on_hold,
                holdReason: FulfillmentHoldReason.awaiting_stock,
                expectedAt: { $lte: now }
            })
            .exec(),

    /**
     * The fulfillment orders whose buyer was asked and let the window close — including the ones
     * already marked expired, whose cancel has not landed yet and is announced again.
     * @param now - the instant of the sweep
     */
    findWaitsExpired: (now) =>
        fulfillmentOrderModel
            .find({
                status: FulfillmentOrderStatus.on_hold,
                holdReason: FulfillmentHoldReason.awaiting_stock,
                $or: [
                    { consent: FulfillmentConsent.expired },
                    { consent: FulfillmentConsent.awaiting, consentDeadline: { $lte: now } }
                ]
            })
            .exec(),

    /**
     * Unset the hold note on every fulfillment order not changed since `cutoff` that still holds
     * one. The filter only matches a fulfillment order that still has a note, so a rerun matches
     * nothing. `timestamps: false` keeps the wipe from moving `updatedAt`, the very clock this query
     * reads.
     *
     * Mongoose `updateMany` options: https://mongoosejs.com/docs/api/query.html#Query.prototype.updateMany()
     *
     * @param cutoff - fulfillment orders with `updatedAt` at or before this are wiped
     * @returns how many lost their note
     */
    scrubHoldNotesBefore: (cutoff) =>
        fulfillmentOrderModel
            .updateMany(
                { updatedAt: { $lte: cutoff }, holdNote: { $exists: true } },
                { $unset: { holdNote: 1 } },
                { timestamps: false }
            )
            .exec()
            .then((result) => result.modifiedCount)
};

/** The shared factory's CRUD surface plus the shipment's own reads and conditional writes. */
export const shipmentRepository: Repository<ShipmentDocument, Wire<ShipmentDocument>> & {
    findByOrderId: (orderId: string, session?: ClientSession) => Promise<ShipmentDocument[]>;
    findByOrderIds: (orderIds: readonly string[]) => Promise<ShipmentDocument[]>;
    findInSession: (id: string, session: ClientSession) => Promise<ShipmentDocument | null>;
    nextNumber: (orderId: string, session: ClientSession) => Promise<number>;
    markDelivered: (
        id: string,
        deliveredAt: Date,
        session: ClientSession
    ) => Promise<ShipmentDocument | null>;
    setTrackingCode: (id: string, trackingCode: string) => Promise<ShipmentDocument | null>;
} = {
    ...createRepository<ShipmentDocument, Wire<ShipmentDocument>>(shipmentModel, {
        transform: applyShipmentTransform
    }),

    /**
     * Every shipment of one order, in the order they were cut.
     * @param orderId - the order
     * @param session - the act's transaction, when the read belongs to one
     */
    findByOrderId: (orderId, session) =>
        shipmentModel
            .find({ orderId: toObjectId(orderId) })
            .sort({ number: 1 })
            .session(session ?? null)
            .exec(),

    /**
     * Every shipment behind a set of orders, in one query — for the account data export, joining
     * shipments onto the caller's own orders. A loop of {@link findByOrderId} would work too, but
     * one query per order for what is meant to be a single export request is the wrong shape.
     * @param orderIds - the orders
     */
    findByOrderIds: (orderIds) =>
        shipmentModel
            .find({ orderId: { $in: orderIds.map((id) => toObjectId(id)) } })
            .sort({ orderId: 1, number: 1 })
            .exec(),

    /**
     * One shipment read inside an act's transaction.
     * @param id - the shipment
     * @param session - the act's transaction
     */
    findInSession: (id, session) => shipmentModel.findById(toObjectId(id)).session(session).exec(),

    /**
     * The number the next shipment of this order takes. Read in the act's transaction: two acts
     * taking the same number conflict on the unique `{ orderId, number }` index, and the driver
     * re-runs the loser against the winner's result.
     * @param orderId - the order
     * @param session - the act's transaction
     */
    nextNumber: (orderId, session) =>
        shipmentModel
            .countDocuments({ orderId: toObjectId(orderId) })
            .session(session)
            .exec()
            .then((count) => count + 1),

    /**
     * Stamp a shipment delivered, but only from `shipped` — atomically. The condition rides in the
     * FILTER, not a preceding read: two carrier ticks racing (a double click, a demo racing a
     * manual advance) would otherwise both load the same `shipped` shipment and both stamp
     * `deliveredAt`, the second write winning silently and the timestamp lying about when the
     * parcel arrived. mongod evaluates the filter atomically, so exactly one tick matches; the
     * loser gets `null`.
     * @param id - the shipment
     * @param deliveredAt - when it arrived
     * @param session - the act's transaction
     */
    markDelivered: (id, deliveredAt, session) =>
        shipmentModel
            .findOneAndUpdate(
                { _id: toObjectId(id), status: 'shipped' },
                { $set: { status: 'delivered', deliveredAt } },
                { returnDocument: 'after', session }
            )
            .exec(),

    /**
     * Correct the tracking code of a shipment still `shipped` — once it has arrived the code is a
     * record of what happened, not a typo to fix.
     * @param id - the shipment
     * @param trackingCode - the corrected code
     */
    setTrackingCode: (id, trackingCode) =>
        shipmentModel
            .findOneAndUpdate(
                { _id: toObjectId(id), status: 'shipped' },
                { $set: { trackingCode } },
                { returnDocument: 'after' }
            )
            .exec()
};
