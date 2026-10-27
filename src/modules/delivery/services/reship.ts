/**
 * @module
 * Sending delivered goods again: a replacement under the legal guarantee. The returned units are
 * open again on the SAME fulfillment orders they shipped from (no new order, invoice or revenue),
 * the stock hold is topped up, the part the shelf cannot cover is owed on a fulfillment order on
 * hold, and the order goes back to `processing` so the replacement leaves through the ordinary
 * shipping door. Runs inside the caller's transaction (a return's receipt).
 *
 * See: docs/modules/delivery.md#replacement-after-a-return
 */

import type { ClientSession } from 'mongoose';
import { orderService } from '@modules/orders';
import { FulfillmentOrderKind, FulfillmentOrderStatus, OrderStatus } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { planReopening, shareOwed, statusOfLines, withLoss } from '../domain';
import type { ProductQuantity, Reopening } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderDocument } from '../model';
import { refuse } from './act';
import { reportProgress } from './progress';
import { createOwedFulfillmentOrder, promiseFor } from './owed';

/**
 * Reopen the claimed fulfillment orders: each gives back its units, and the owed part moves to a
 * fulfillment order of its own, so a line never holds more than the shelf can send.
 *
 * @param orders - the order's fulfillment orders
 * @param reopenings - what {@link planReopening} decided
 * @param owedBy - per fulfillment order id, the units it hands to the owed order
 * @param session - the caller's transaction
 */
const reopenLines = async (
    orders: readonly FulfillmentOrderDocument[],
    reopenings: readonly Reopening[],
    owedBy: ReadonlyMap<string, ProductQuantity[]>,
    session: ClientSession
): Promise<void> => {
    for (const { fulfillmentOrderId, units } of reopenings) {
        const origin = orders.find(({ _id }) => String(_id) === fulfillmentOrderId);
        if (!origin) continue;
        const lines = withLoss(origin.lines, units, owedBy.get(fulfillmentOrderId) ?? []);
        const claimed = await fulfillmentOrderRepository.claim(
            fulfillmentOrderId,
            origin.revision,
            {
                lines,
                status: statusOfLines(lines, origin.status === FulfillmentOrderStatus.on_hold)
            },
            session
        );
        if (!claimed) refuse(409, ERROR_CODES.DELIVERY_NOT_REOPENABLE, 'delivery.not-reopenable');
    }
};

/**
 * Put the order back to being fulfilled: a `delivered` one steps back to `processing`, a `shipped`
 * one likewise; a `processing` one is already there. A cancelled or unpaid order cannot be sent to.
 * @param status - the order's status
 * @param orderId - the order
 * @param session - the caller's transaction
 * @param actor - the staff member whose receipt this is
 */
const reopenOrder = async (
    status: OrderStatus,
    orderId: string,
    session: ClientSession,
    actor: string | null | undefined
): Promise<void> => {
    if (status === OrderStatus.processing) return;
    const moved =
        status === OrderStatus.delivered
            ? await orderService.markReshipped(orderId, session, actor)
            : status === OrderStatus.shipped
              ? await orderService.markReopened(orderId, session, actor)
              : null;
    if (!moved) refuse(409, ERROR_CODES.DELIVERY_NOT_REOPENABLE, 'delivery.not-reopenable');
};

/**
 * Open the units of a return that closes with a replacement, send-able again on the same order.
 * All or nothing: every refusal aborts the caller's transaction.
 *
 * @param orderId - the order the goods came back to
 * @param lines - the units to send again, per product
 * @param session - the receipt's transaction; the catalogue's stock cache is the caller's to refresh
 * @param actor - the staff member who received the goods
 * @throws {ActRefusal} 409 `DELIVERY_NOT_REOPENABLE` when the order shipped fewer units than come
 *   back, or is not in a state a replacement can leave from
 */
export const reopenForReplacement = async (
    orderId: string,
    lines: readonly ProductQuantity[],
    session: ClientSession,
    actor: string | null | undefined
): Promise<void> => {
    const order = await orderService.readOrder(orderId, session);
    if (!order) return refuse(409, ERROR_CODES.DELIVERY_NOT_REOPENABLE, 'delivery.not-reopenable');
    const orders = await fulfillmentOrderRepository.findByOrderId(orderId, session);
    const reopenings = planReopening(
        orders.map((one) => ({
            id: String(one._id),
            physical: one.kind === FulfillmentOrderKind.physical,
            number: one.number,
            lines: one.lines
        })),
        lines
    );
    if (!reopenings)
        return refuse(409, ERROR_CODES.DELIVERY_NOT_REOPENABLE, 'delivery.not-reopenable');

    const taken = await orderService.topUpStock(orderId, lines, session);
    const owed = taken
        .filter(({ owed: quantity }) => quantity > 0)
        .map(({ productId, owed: quantity }) => ({ productId, quantity }));

    await reopenLines(orders, reopenings, shareOwed(reopenings, owed), session);
    if (owed.length > 0)
        await createOwedFulfillmentOrder(
            {
                orderId: orders[0]?.orderId ?? order._id,
                titleOf: (productId) =>
                    orders.flatMap((one) => one.lines).find((line) => line.productId === productId)
                        ?.title ?? ''
            },
            owed,
            await promiseFor(owed, new Date()),
            session
        );

    // Units are open again, so the order is being fulfilled once more.
    await reportProgress(orderId, session);
    await reopenOrder(order.status, orderId, session, actor);
};
