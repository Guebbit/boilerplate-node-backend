/**
 * @module
 * Delivery persistence — the two collections and the conditional writes every act is driven
 * through. The return types are written out because Mongoose's generics are too large for
 * TypeScript to serialize an inferred one at an export boundary (TS7056), the same reason
 * `Repository` exists. See: docs/modules/delivery.md
 */

import type { ClientSession, QueryFilter } from 'mongoose';
import {
    fulfillmentOrderModel,
    shipmentModel,
    applyFulfillmentOrderTransform,
    applyShipmentTransform
} from './model';
import type { FulfillmentOrderDocument, ShipmentDocument } from './model';
import { RENEWED_ASK_BEFORE_DAYS } from './domain';
import type { FulfillmentOrderDraft, WaitCause } from './domain';
import {
    FulfillmentConsent,
    FulfillmentHoldReason,
    FulfillmentOrderStatus,
    PreorderFulfillmentState
} from '@types';
import {
    createRepository,
    toObjectId,
    type Repository,
    type Wire
} from '@infrastructure/persistence/create-repository';
import { DAY_MS } from '@domain-primitives/time';

/** What the preorder board filters by. */
export interface BoardFilters {
    /** Why it waits: `preorder`, `backorder`, or `any` dated wait (they carry an agreed date). */
    cause?: 'preorder' | 'backorder' | 'any' | undefined;
    state?: PreorderFulfillmentState | undefined;
    productId?: string | undefined;
    /** Expected date passed with units remaining. */
    late?: boolean | undefined;
    /** Still waiting for stock, expected within this many days. */
    dueWithin?: number | undefined;
    /** Only fulfillment orders of these orders — a caller who may read only their own. */
    orderIds?: readonly string[] | undefined;
}

/** One product's preorder units, as the aggregation counts them. */
export interface ProductSummaryRow {
    productId: string;
    title: string;
    firstAgreedAt: Date;
    paid: number;
    waiting: number;
    awaitingYes: number;
    allocated: number;
    shipped: number;
    cancelled: number;
    late: number;
}

/**
 * The Mongo condition each board state stands for. Kept beside the query, in step with
 * `boardStateOf` in `./domain` by hand: the filter and the label must agree on which fulfillment
 * orders are "waiting", and the preorder board's integration suite holds them to it.
 *
 * @param state - the state asked for
 */
const stateCondition = (state: PreorderFulfillmentState): QueryFilter<FulfillmentOrderDocument> => {
    const awaitingStock = {
        status: FulfillmentOrderStatus.on_hold,
        holdReason: FulfillmentHoldReason.awaiting_stock
    };
    const asked = [FulfillmentConsent.awaiting, FulfillmentConsent.expired];
    switch (state) {
        case PreorderFulfillmentState.waiting: {
            return { ...awaitingStock, consent: { $nin: asked } };
        }
        case PreorderFulfillmentState.awaiting_yes: {
            return { ...awaitingStock, consent: { $in: asked } };
        }
        case PreorderFulfillmentState.allocated: {
            return {
                $or: [
                    {
                        status: {
                            $in: [FulfillmentOrderStatus.open, FulfillmentOrderStatus.in_progress]
                        }
                    },
                    {
                        status: FulfillmentOrderStatus.on_hold,
                        holdReason: { $ne: FulfillmentHoldReason.awaiting_stock }
                    }
                ]
            };
        }
        case PreorderFulfillmentState.shipped: {
            return { status: FulfillmentOrderStatus.closed };
        }
        case PreorderFulfillmentState.cancelled: {
            return { status: FulfillmentOrderStatus.cancelled };
        }
    }
};

/**
 * The filter a board read asks the collection, every part ANDed.
 *
 * @param filters - what the caller asked for, and the orders they may read
 * @param now - the instant `late` and `dueWithin` are measured at
 */
const boardWhere = (filters: BoardFilters, now: Date): QueryFilter<FulfillmentOrderDocument> => {
    const all: QueryFilter<FulfillmentOrderDocument>[] = [];
    if (filters.cause === 'any') all.push({ agreedAt: { $exists: true } });
    // A preorder wait made before backorder existed carries no cause, hence `$ne`.
    if (filters.cause === 'preorder')
        all.push({ agreedAt: { $exists: true }, cause: { $ne: 'backorder' } });
    if (filters.cause === 'backorder') all.push({ cause: 'backorder' });
    if (filters.state) all.push(stateCondition(filters.state));
    if (filters.productId) all.push({ 'lines.productId': filters.productId });
    if (filters.late)
        all.push({
            status: {
                $in: [
                    FulfillmentOrderStatus.on_hold,
                    FulfillmentOrderStatus.open,
                    FulfillmentOrderStatus.in_progress
                ]
            },
            expectedAt: { $lt: now }
        });
    if (filters.dueWithin !== undefined)
        all.push({
            status: FulfillmentOrderStatus.on_hold,
            holdReason: FulfillmentHoldReason.awaiting_stock,
            expectedAt: { $gt: now, $lte: new Date(now.getTime() + filters.dueWithin * DAY_MS) }
        });
    if (filters.orderIds)
        all.push({ orderId: { $in: filters.orderIds.map((id) => toObjectId(id)) } });
    return all.length > 0 ? { $and: all } : {};
};

/** What an act changes on a fulfillment order, written under a revision claim. */
export type FulfillmentOrderPatch = Partial<
    Pick<
        FulfillmentOrderDocument,
        | 'lines'
        | 'status'
        | 'holdReason'
        | 'holdNote'
        | 'holdMessage'
        | 'expectedAt'
        | 'consent'
        | 'consentDeadline'
        | 'lastNoticeAt'
        | 'slips'
        | 'cancelReason'
    >
> & {
    /** Fields to remove — a released hold carries no reason or note, a confirmed wait no deadline, a cleared date no expected date. */
    unset?: readonly (
        | 'holdReason'
        | 'holdNote'
        | 'holdMessage'
        | 'consentDeadline'
        | 'expectedAt'
    )[];
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
    ) => Promise<boolean>;
    claim: (
        id: string,
        revision: number,
        patch: FulfillmentOrderPatch,
        session: ClientSession
    ) => Promise<FulfillmentOrderDocument | null>;
    scrubHoldNotesBefore: (cutoff: Date) => Promise<number>;
    findWaitingForProduct: (
        productId: string,
        cause: WaitCause
    ) => Promise<FulfillmentOrderDocument[]>;
    findDateNear: (now: Date) => Promise<FulfillmentOrderDocument[]>;
    findWaitsExpired: (now: Date) => Promise<FulfillmentOrderDocument[]>;
    searchBoard: (
        filters: BoardFilters,
        now: Date,
        page: { skip: number; limit: number }
    ) => Promise<{ items: FulfillmentOrderDocument[]; totalItems: number }>;
    summarizeProducts: (
        filters: Pick<BoardFilters, 'productId' | 'orderIds'>,
        now: Date,
        page: { skip: number; limit: number }
    ) => Promise<{ items: ProductSummaryRow[]; totalItems: number }>;
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
     * @returns whether this call made it, so a caller can narrate a birth exactly once
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
                        ...(draft.cause ? { cause: draft.cause } : {}),
                        ...(draft.defaulted ? { defaulted: true } : {}),
                        ...(draft.agreedAt ? { agreedAt: draft.agreedAt } : {}),
                        ...(draft.expectedAt ? { expectedAt: draft.expectedAt } : {}),
                        slips: 0
                    }
                },
                { upsert: true, session }
            )
            .exec()
            .then((result) => result.upsertedCount > 0),

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
    findWaitingForProduct: (productId, cause) =>
        fulfillmentOrderModel
            .find({
                status: FulfillmentOrderStatus.on_hold,
                holdReason: FulfillmentHoldReason.awaiting_stock,
                'lines.productId': productId,
                // A preorder wait carries no cause when it was made before backorder existed.
                cause: cause === 'backorder' ? 'backorder' : { $ne: 'backorder' }
            })
            .exec(),

    /**
     * The waiting fulfillment orders whose expected date is near (within the longest margin a
     * question goes out ahead of it) or past, for the sweep to judge against their last notice (a date alone
     * cannot say whether the buyer was already told).
     * @param now - the instant of the sweep
     */
    findDateNear: (now) =>
        fulfillmentOrderModel
            .find({
                status: FulfillmentOrderStatus.on_hold,
                holdReason: FulfillmentHoldReason.awaiting_stock,
                expectedAt: { $lte: new Date(now.getTime() + RENEWED_ASK_BEFORE_DAYS * DAY_MS) }
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
     * A page of fulfillment orders for the preorder board, the earliest expected first, ties broken by
     * id so a page never repeats or skips a row.
     *
     * @param filters - what the board asks for
     * @param now - the instant `late` and `dueWithin` are measured at
     * @param page - the window
     */
    searchBoard: (filters, now, { skip, limit }) => {
        const where = boardWhere(filters, now);
        return Promise.all([
            fulfillmentOrderModel
                .find(where)
                .sort({ expectedAt: 1, _id: 1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            fulfillmentOrderModel.countDocuments(where).exec()
        ]).then(([items, totalItems]) => ({ items, totalItems }));
    },

    /**
     * A page of per-product unit counts across every preorder fulfillment order, earliest promise
     * first. Units, not fulfillment orders; one `$group` over the unwound lines. A product's counts
     * add up: `paid = waiting + awaitingYes + allocated + shipped + cancelled`.
     *
     * Mongo aggregation: https://www.mongodb.com/docs/manual/aggregation/
     *
     * @param filters - one product, and/or the orders the caller may read
     * @param now - the instant `late` is measured at
     * @param page - the window
     */
    summarizeProducts: (filters, now, { skip, limit }) => {
        const remaining = {
            $subtract: [
                '$lines.quantity',
                { $add: ['$lines.shippedQuantity', '$lines.cancelledQuantity'] }
            ]
        };
        const onHoldForStock = {
            $and: [
                { $eq: ['$status', FulfillmentOrderStatus.on_hold] },
                { $eq: ['$holdReason', FulfillmentHoldReason.awaiting_stock] }
            ]
        };
        const beingAsked = {
            $in: [
                { $ifNull: ['$consent', 'none'] },
                [FulfillmentConsent.awaiting, FulfillmentConsent.expired]
            ]
        };
        const sumWhere = (condition: unknown) => ({
            $sum: { $cond: [condition, remaining, 0] }
        });
        const match = boardWhere({ ...filters, cause: 'any' }, now);

        return (
            fulfillmentOrderModel
                .aggregate<{
                    items: (Omit<ProductSummaryRow, 'productId'> & { _id: string })[];
                    total: { count: number }[];
                }>([
                    { $match: match },
                    { $unwind: '$lines' },
                    ...(filters.productId
                        ? [{ $match: { 'lines.productId': filters.productId } }]
                        : []),
                    {
                        $group: {
                            _id: '$lines.productId',
                            title: { $first: '$lines.title' },
                            firstAgreedAt: { $min: '$agreedAt' },
                            paid: { $sum: '$lines.quantity' },
                            shipped: { $sum: '$lines.shippedQuantity' },
                            cancelled: { $sum: '$lines.cancelledQuantity' },
                            waiting: sumWhere({ $and: [onHoldForStock, { $not: [beingAsked] }] }),
                            awaitingYes: sumWhere({ $and: [onHoldForStock, beingAsked] }),
                            allocated: sumWhere({
                                $or: [
                                    {
                                        $in: [
                                            '$status',
                                            [
                                                FulfillmentOrderStatus.open,
                                                FulfillmentOrderStatus.in_progress
                                            ]
                                        ]
                                    },
                                    {
                                        $and: [
                                            { $eq: ['$status', FulfillmentOrderStatus.on_hold] },
                                            {
                                                $ne: [
                                                    '$holdReason',
                                                    FulfillmentHoldReason.awaiting_stock
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }),
                            late: sumWhere({
                                $and: [
                                    {
                                        $in: [
                                            '$status',
                                            [
                                                FulfillmentOrderStatus.on_hold,
                                                FulfillmentOrderStatus.open,
                                                FulfillmentOrderStatus.in_progress
                                            ]
                                        ]
                                    },
                                    { $lt: ['$expectedAt', now] }
                                ]
                            })
                        }
                    },
                    {
                        $facet: {
                            items: [
                                { $sort: { firstAgreedAt: 1, _id: 1 } },
                                { $skip: skip },
                                { $limit: limit }
                            ],
                            total: [{ $count: 'count' }]
                        }
                    }
                ])
                .exec()
                // A `$facet` always answers exactly one document, even over nothing.
                .then(([result]) => ({
                    items: result.items.map(({ _id, ...rest }) => ({ productId: _id, ...rest })),
                    totalItems: result.total[0]?.count ?? 0
                }))
        );
    },

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
    findByFulfillmentOrderIds: (
        fulfillmentOrderIds: readonly string[]
    ) => Promise<ShipmentDocument[]>;
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
     * Every shipment cut from a set of fulfillment orders, in one query — the preorder board's
     * `delivered` flag for a page of rows.
     * @param fulfillmentOrderIds - the fulfillment orders on the page
     */
    findByFulfillmentOrderIds: (fulfillmentOrderIds) =>
        shipmentModel
            .find({
                fulfillmentOrderId: { $in: fulfillmentOrderIds.map((id) => toObjectId(id)) }
            })
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
