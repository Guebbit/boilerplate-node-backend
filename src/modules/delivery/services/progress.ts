/**
 * @module
 * Keeping `orders` in step with what delivery wrote, inside the act's transaction: the summary is
 * recomputed from the records themselves (never adjusted), and the order's status moves exactly
 * when the summary says the goods have all left, or all arrived. `orders` stays the only status
 * writer — this file asks it to move, with the act's session, and refuses the act when it cannot.
 */

import type { ClientSession } from 'mongoose';
import { OrderStatus } from '@types';
import { orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { ERROR_CODES } from '@api/error-codes';
import { summarize, type FulfillmentReport } from '../domain';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import { refuse } from './act';

/** What {@link reportProgress} read and wrote. */
export interface ProgressReport {
    /** The order as the summary write left it. */
    order: OrderDocument;
    summary: FulfillmentReport;
    fulfillmentOrders: FulfillmentOrderDocument[];
    shipments: ShipmentDocument[];
}

/**
 * Recompute the order's fulfilment summary from every fulfillment order and shipment as the act's
 * snapshot sees them, and hand it to `orders`. Refuses the act when `orders` says the order can no
 * longer be fulfilled — cancelled in the meantime, which is the half of "a ship racing a cancel
 * cannot both win" that lives here.
 *
 * @param orderId - the order
 * @param session - the act's transaction
 */
export const reportProgress = (orderId: string, session: ClientSession): Promise<ProgressReport> =>
    // One read after the other: a transaction's session does not take parallel operations.
    fulfillmentOrderRepository.findByOrderId(orderId, session).then((fulfillmentOrders) =>
        shipmentRepository.findByOrderId(orderId, session).then((shipments) => {
            const summary = summarize({ fulfillmentOrders, shipments });
            return orderService
                .recordFulfillmentProgress(orderId, summary, session)
                .then((order) => {
                    if (!order)
                        return refuse(
                            409,
                            ERROR_CODES.DELIVERY_NOT_SHIPPABLE,
                            'delivery.not-shippable'
                        );
                    return { order, summary, fulfillmentOrders, shipments };
                });
        })
    );

/**
 * The order's status move failed to land: it was not where the act needed it. The act aborts.
 * @param moved - what the `orders` door answered
 */
const expectMoved = (moved: OrderDocument | null): void => {
    if (!moved) refuse(409, ERROR_CODES.ORDER_NOT_PROCESSING, 'delivery.not-processing');
};

/**
 * Move the order's status when the summary says it is due — and only then:
 *
 * | The summary says | The order moves |
 * | --- | --- |
 * | units remain, or nothing shipped | nowhere |
 * | nothing remains, a shipment is still out | `processing → shipped` |
 * | nothing remains, every shipment arrived | `shipped → delivered`, or both at once from `processing` |
 *
 * The last row from `processing` is the one named double move: a digital fulfilment, or a remainder
 * cancelled after every shipment had already arrived.
 *
 * @param orderId - the order
 * @param status - the order's status as the summary write left it
 * @param summary - where the goods stand
 * @param at - the instant the clock starts for a completed order: the last arrival, or the cancel
 * @param session - the act's transaction
 */
export const settleOrder = (
    orderId: string,
    status: OrderStatus,
    summary: FulfillmentReport,
    at: Date,
    session: ClientSession
): Promise<void> => {
    if (summary.remaining > 0 || !summary.shipped) return Promise.resolve();

    if (summary.undelivered > 0)
        return status === OrderStatus.processing
            ? orderService.markShipped(orderId, session).then(expectMoved)
            : Promise.resolve();

    if (status === OrderStatus.processing)
        return orderService.markFulfilmentComplete(orderId, at, session).then(expectMoved);
    if (status === OrderStatus.shipped)
        return orderService.markDelivered(orderId, at, session).then(expectMoved);
    return Promise.resolve();
};
