/**
 * @module
 * Taking fulfillment orders out of play without shipping them: the remainder of one canceled by
 * `returns` (the buyer's partial withdrawal, or staff's), and every one of an order's canceled with
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
import { remainderLines, statusOfLines, withRemainderCanceled } from '../domain';
import type { ProductQuantity } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import { announceCanceled, recordRemainderCanceled } from './announce';
import { refuse, runAct } from './act';
import { reportProgress, settleOrder } from './progress';

/** What {@link cancelRemainder} answers. */
export type RemainderCancel =
    | {
          ok: true;
          /** What was canceled, per product. */
          lines: ProductQuantity[];
          /**
           * The fulfillment order was held for stock: what was canceled is a claim on the preorder
           * allowance, not units on the shelf, and `inventory` gives back the right one.
           */
          waitingForStock: boolean;
          /**
           * Present when the settlement canceled the order (every parcel lost). The caller calls
           * it after ITS transaction commits: it writes the audit row and the analytics event.
           */
          reportCanceled?: () => void;
      }
    | {
          ok: false;
          /**
           * `not-found`: no such fulfillment order on this order. `nothing-shipped`: nothing has
           * left the order and no other fulfillment order has units, so the whole order is
           * canceled instead. `nothing-to-cancel`: no
           * remainder is left on it.
           */
          reason: 'not-found' | 'nothing-shipped' | 'nothing-to-cancel';
      };

/**
 * Cancel what has not shipped yet on one fulfillment order, inside the CALLER's transaction. With
 * nothing shipped it only goes while another fulfillment order still has units; the last live one
 * is the whole order, which is canceled as an order. Every
 * refusal is decided before the first write and answered as `ok: false`; a failure after the first
 * write throws, aborting the caller's whole transaction — returning there would commit a claim
 * with nothing around it.
 *
 * The lines become `canceledQuantity`, the status follows (`closed` when something shipped from it,
 * `canceled` when nothing ever did), the order's summary is recomputed, and the order moves when
 * that completes it: the remainder canceled after every shipment had already arrived makes the
 * order `shipped` and `delivered` in this one transaction, its withdrawal clock counted from now
 * (the later of the last delivery and this cancel — the order only became complete here).
 *
 * @param fulfillmentOrderId - the fulfillment order whose remainder is canceled
 * @param orderId - the order the caller says it belongs to
 * @param session - the caller's transaction
 * @param reason - who canceled it, stored on the fulfillment order
 * @param actor - the account that made the cancel (the buyer or a staff member), for the order's
 *   timeline rows; absent when the system did
 * @throws {ActRefusal} when the fulfillment order or the order moved after the first write
 */
export const cancelRemainder = async (
    fulfillmentOrderId: string,
    orderId: string,
    session: ClientSession,
    reason: FulfillmentCancelReason = FulfillmentCancelReason.buyer,
    actor?: string | null
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

    const canceledLines = withRemainderCanceled(fulfillmentOrder.lines);
    const canceled = await fulfillmentOrderRepository.claim(
        fulfillmentOrderId,
        fulfillmentOrder.revision,
        {
            lines: canceledLines,
            status: statusOfLines(canceledLines, false),
            cancelReason: reason,
            unset: ['holdReason', 'holdNote']
        },
        session
    );
    if (!canceled) return refuse(409, ERROR_CODES.DELIVERY_NOT_SHIPPABLE, 'delivery.not-shippable');

    const progress = await reportProgress(orderId, session);
    const reportCanceled = await settleOrder(
        orderId,
        progress.order.status,
        progress.summary,
        new Date(),
        session,
        actor
    );
    await recordRemainderCanceled(canceled, session, actor);
    await announceCanceled(canceled, session);
    return { ok: true, lines, waitingForStock, ...(reportCanceled && { reportCanceled }) };
};

/**
 * Cancel every fulfillment order of an order that was canceled. `ORDER_CANCELED`'s listener: an
 * order is only cancelable while nothing has shipped, so every fulfillment order still holds its
 * whole quantity and ends `canceled`. Idempotent — one already closed or canceled is left alone,
 * so a redelivered event writes nothing.
 *
 * @param orderId - the order that was canceled
 */
export const cancelAllForOrder = (orderId: string): Promise<void> =>
    runAct(async (session) => {
        const all = await fulfillmentOrderRepository.findByOrderId(orderId, session);
        // One after another: a transaction's session does not take parallel operations.
        for (const fulfillmentOrder of all) {
            if (fulfillmentOrder.status === 'closed' || fulfillmentOrder.status === 'canceled')
                continue;
            const lines = withRemainderCanceled(fulfillmentOrder.lines);
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
            if (claimed) await announceCanceled(claimed, session);
        }
    }).then(() => undefined);
