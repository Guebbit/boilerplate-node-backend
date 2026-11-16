/**
 * @module
 * Keeping `orders` in step with what delivery wrote, inside the act's transaction: the summary is
 * recomputed from the records themselves (never adjusted), and the order's status moves exactly
 * when the summary says the goods have all left, or all arrived. `orders` stays the only status
 * writer — this file asks it to move, with the act's session, and refuses the act when it cannot.
 */

import type { ClientSession } from 'mongoose';
import { canProcessOrder, orderService } from '@modules/orders';
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
 * Recompute the order's fulfillment summary from every fulfillment order and shipment as the act's
 * snapshot sees them, and hand it to `orders`. Refuses the act when `orders` says the order can no
 * longer be fulfilled — canceled in the meantime, which is the half of "a ship racing a cancel
 * cannot both win" that lives here.
 *
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
 * Make the `paid → processing` move inside the act, when the order is still `paid` — shipping and
 * fulfilling digital goods both do it themselves, so no separate "start" is needed first. Runs
 * before {@link reportProgress}, so the summary write and {@link settleOrder} see `processing`.
 * @param order - the order as the act read it
 * @param session - the act's transaction
 * @param actor - the staff member whose act this is, for the order's timeline
 * @throws {ActRefusal} 409 `ORDER_NOT_PAID` when the order moved away from `paid` since the read
 */
export const startFulfillment = async (
    order: OrderDocument,
    session: ClientSession,
    actor: string | null | undefined
): Promise<void> => {
    if (!canProcessOrder(order.status)) return;
    const moved = await orderService.markProcessing(String(order._id), session, actor);
    if (!moved) refuse(409, ERROR_CODES.ORDER_NOT_PAID, 'delivery.not-paid');
};

/**
 * Ask `orders` to settle its status from the summary the act just wrote, and refuse the act when a
 * move was due and did not land. `orders` picks the edge (ship, deliver, both at once, or the
 * lost-parcel cancel); this module only states that the goods moved.
 *
 * @param at - the instant the clock starts for a completed order: the last arrival, or the cancel
 * @param session - the act's transaction
 * @param actor - the staff member whose act this is, for the order's timeline; absent for the system
 * @returns a report-after-commit callback when the settlement canceled the order (a lost parcel);
 *   the caller owns the transaction, so it calls it once that commits
 * @throws {ActRefusal} 409 `ORDER_NOT_PROCESSING` when a due move found the order elsewhere
 */
export const settleOrder = (
    orderId: string,
    at: Date,
    session: ClientSession,
    actor?: string | null
): Promise<(() => void) | undefined> =>
    orderService.settleFulfillment(orderId, at, session, actor).then((settled) => {
        if (!settled)
            return refuse(409, ERROR_CODES.ORDER_NOT_PROCESSING, 'delivery.not-processing');
        return settled.reportCanceled;
    });
