/**
 * @module
 * Keeping the fulfillment records in step with an admin status override. The override moves the
 * order's status by hand, so `orders` announces `order.status_overridden`; this is its listener.
 * Forward to `shipped` ships every remainder, forward to `delivered` delivers them too — all
 * stamped with the override's own instant, the same one `withdrawUntil` was counted from.
 *
 * The shipments it cuts are `forced`, take no stock (the override already shipped what was left of
 * the hold) and fire no email and no webhook: nothing left that anyone recorded, which keeps the
 * override's promise of "no parcel, no email".
 *
 * See: docs/modules/delivery.md#the-status-override
 */

import type { ClientSession } from 'mongoose';
import { OrderStatus } from '@types';
import { remainderLines, remainingOf } from '../domain';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';
import type { FulfillmentOrderDocument } from '../model';
import { runAct } from './act';
import { cutShipment } from './cut';
import { reportProgress } from './progress';

/**
 * Cut the forced shipment for one fulfillment order's remainder, if it has one.
 * @param fulfillmentOrder - the fulfillment order, as the snapshot reads it
 * @param to - the status the order was overridden to
 * @param at - the override's instant
 * @param session - the act's transaction
 */
const shipRemainder = (
    fulfillmentOrder: FulfillmentOrderDocument,
    to: OrderStatus,
    at: Date,
    session: ClientSession
): Promise<void> =>
    remainingOf(fulfillmentOrder.lines) === 0
        ? Promise.resolve()
        : cutShipment(
              {
                  fulfillmentOrder,
                  lines: remainderLines(fulfillmentOrder.lines),
                  forced: true,
                  delivered: to === OrderStatus.delivered,
                  at,
                  takeStock: false
              },
              session
          ).then(() => undefined);

/**
 * Deliver every shipment still out, at the override's instant.
 * @param orderId - the order
 * @param at - the override's instant
 * @param session - the act's transaction
 */
const deliverOutstanding = async (
    orderId: string,
    at: Date,
    session: ClientSession
): Promise<void> => {
    const shipments = await shipmentRepository.findByOrderId(orderId, session);
    // One after another: a transaction's session does not take parallel operations.
    for (const { _id, status } of shipments)
        if (status === 'shipped') await shipmentRepository.markDelivered(String(_id), at, session);
};

/**
 * Bring the order's fulfillment records in step with an override that landed. Idempotent: a
 * redelivered event finds nothing remaining and nothing out, and rewrites the same summary.
 *
 * @param orderId - the order that was overridden
 * @param to - the status it was overridden to; only `shipped` and `delivered` change anything
 * @param at - the override's instant
 */
export const syncWithOverride = (orderId: string, to: OrderStatus, at: Date): Promise<void> => {
    if (to !== OrderStatus.shipped && to !== OrderStatus.delivered) return Promise.resolve();

    return runAct(async (session) => {
        const all = await fulfillmentOrderRepository.findByOrderId(orderId, session);
        // One after another: a transaction's session does not take parallel operations.
        for (const fulfillmentOrder of all) await shipRemainder(fulfillmentOrder, to, at, session);
        if (to === OrderStatus.delivered) await deliverOutstanding(orderId, at, session);
        await reportProgress(orderId, session);
    }).then(() => undefined);
};
