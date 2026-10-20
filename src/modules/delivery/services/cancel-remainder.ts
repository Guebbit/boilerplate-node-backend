/**
 * @module
 * Taking fulfillment orders out of play without shipping them: the remainder of one cancelled by
 * `returns` (the buyer's partial withdrawal, or staff's), and every one of an order's cancelled with
 * the order itself. `delivery` marks the lines — the money, the stock and the Return record belong
 * to `returns`, which is the only module that already reaches all of them, so it drives this door
 * inside its own transaction.
 *
 * See: docs/modules/delivery.md#cancelling-what-has-not-shipped
 */

import type { ClientSession } from 'mongoose';
import { orderService } from '@modules/orders';
import { FulfillmentCancelReason, FulfillmentHoldReason, FulfillmentOrderStatus } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { remainderLines, statusOfLines, withRemainderCancelled } from '../domain';
import type { ProductQuantity } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import { announceCancelled, recordRemainderCancelled } from './announce';
import { refuse, runAct } from './act';
import { reportProgress, settleOrder } from './progress';

/** What {@link cancelRemainder} answers. */
export type RemainderCancel =
    | {
          ok: true;
          /** What was cancelled, per product. */
          lines: ProductQuantity[];
          /**
           * The fulfillment order was held for stock: what was cancelled is a claim on the preorder
           * allowance, not units on the shelf, and `inventory` gives back the right one.
           */
          waitingForStock: boolean;
      }
    | {
          ok: false;
          /**
           * `not-found`: no such fulfillment order on this order. `nothing-shipped`: nothing has
           * left the order and no other fulfillment order has units, so the whole order is
           * cancelled instead. `nothing-to-cancel`: no
           * remainder is left on it.
           */
          reason: 'not-found' | 'nothing-shipped' | 'nothing-to-cancel';
      };

/**
 * Cancel what has not shipped yet on one fulfillment order, inside the CALLER's transaction. With
 * nothing shipped it only goes while another fulfillment order still has units; the last live one
 * is the whole order, which is cancelled as an order. Every
 * refusal is decided before the first write and answered as `ok: false`; a failure after the first
 * write throws, aborting the caller's whole transaction — returning there would commit a claim
 * with nothing around it.
 *
 * The lines become `cancelledQuantity`, the status follows (`closed` when something shipped from it,
 * `cancelled` when nothing ever did), the order's summary is recomputed, and the order moves when
 * that completes it: the remainder cancelled after every shipment had already arrived makes the
 * order `shipped` and `delivered` in this one transaction, its withdrawal clock counted from now
 * (the later of the last delivery and this cancel — the order only became complete here).
 *
 * @param fulfillmentOrderId - the fulfillment order whose remainder is cancelled
 * @param orderId - the order the caller says it belongs to
 * @param session - the caller's transaction
 * @param reason - who cancelled it, stored on the fulfillment order
 * @throws {ActRefusal} when the fulfillment order or the order moved after the first write
 */
export const cancelRemainder = async (
    fulfillmentOrderId: string,
    orderId: string,
    session: ClientSession,
    reason: FulfillmentCancelReason = FulfillmentCancelReason.buyer
): Promise<RemainderCancel> => {
    const fulfillmentOrder = await fulfillmentOrderRepository.findInSession(
        fulfillmentOrderId,
        session
    );
    if (!fulfillmentOrder || String(fulfillmentOrder.orderId) !== orderId)
        return { ok: false, reason: 'not-found' };

    const order = await orderService.readOrder(orderId, session);
    if (!order) return { ok: false, reason: 'not-found' };

    const lines = remainderLines(fulfillmentOrder.lines);
    if (lines.length === 0) return { ok: false, reason: 'nothing-to-cancel' };

    // Nothing has shipped: a group may go alone only while another keeps something to ship.
    if (order.fulfillment?.shipped !== true) {
        const others = await fulfillmentOrderRepository.findByOrderId(orderId, session);
        const otherLive = others.some(
            (other) =>
                String(other._id) !== fulfillmentOrderId && remainderLines(other.lines).length > 0
        );
        if (!otherLive) return { ok: false, reason: 'nothing-shipped' };
    }
    const waitingForStock =
        fulfillmentOrder.status === FulfillmentOrderStatus.on_hold &&
        fulfillmentOrder.holdReason === FulfillmentHoldReason.awaiting_stock;

    const cancelledLines = withRemainderCancelled(fulfillmentOrder.lines);
    const cancelled = await fulfillmentOrderRepository.claim(
        fulfillmentOrderId,
        fulfillmentOrder.revision,
        {
            lines: cancelledLines,
            status: statusOfLines(cancelledLines, false),
            cancelReason: reason,
            unset: ['holdReason', 'holdNote']
        },
        session
    );
    if (!cancelled)
        return refuse(409, ERROR_CODES.DELIVERY_NOT_SHIPPABLE, 'delivery.not-shippable');

    const progress = await reportProgress(orderId, session);
    await settleOrder(orderId, progress.order.status, progress.summary, new Date(), session);
    await recordRemainderCancelled(cancelled, session);
    await announceCancelled(cancelled, session);
    return { ok: true, lines, waitingForStock };
};

/**
 * Cancel every fulfillment order of an order that was cancelled. `ORDER_CANCELLED`'s listener: an
 * order is only cancellable while nothing has shipped, so every fulfillment order still holds its
 * whole quantity and ends `cancelled`. Idempotent — one already closed or cancelled is left alone,
 * so a redelivered event writes nothing.
 *
 * @param orderId - the order that was cancelled
 */
export const cancelAllForOrder = (orderId: string): Promise<void> =>
    runAct(async (session) => {
        const all = await fulfillmentOrderRepository.findByOrderId(orderId, session);
        // One after another: a transaction's session does not take parallel operations.
        for (const fulfillmentOrder of all) {
            if (fulfillmentOrder.status === 'closed' || fulfillmentOrder.status === 'cancelled')
                continue;
            const lines = withRemainderCancelled(fulfillmentOrder.lines);
            const claimed = await fulfillmentOrderRepository.claim(
                String(fulfillmentOrder._id),
                fulfillmentOrder.revision,
                {
                    lines,
                    status: statusOfLines(lines, false),
                    cancelReason: FulfillmentCancelReason.order,
                    unset: ['holdReason', 'holdNote']
                },
                session
            );
            if (claimed) await announceCancelled(claimed, session);
        }
    }).then(() => undefined);
