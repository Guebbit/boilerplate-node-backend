/**
 * @module
 * The system split of a short stock delivery: a preorder line asked for 3 units and the stock that
 * arrived covers 2. The two allocated units move to a NEW `open` fulfillment order and ship; the
 * rest stays `on_hold` for `awaiting_stock`. Without it the 2 units could never ship — a hand
 * release of `awaiting_stock` is refused, and waiting for the third would keep the buyer waiting for
 * goods already on the shelf. Shopify's `fulfillmentOrderSplit`; staff have no button for it (the
 * admin can still hold the new `open` order to ship everything together).
 *
 * Called by the stock allocation, never by a request: no route reaches it, and it is unused until
 * preorders exist. It is part of the published surface on purpose — see `docs/modules/delivery.md#a-short-stock-delivery`.
 */

import type { ClientSession } from 'mongoose';
import { FulfillmentHoldReason, FulfillmentOrderStatus } from '@types';
import { orderService } from '@modules/orders';
import { ERROR_CODES } from '@api/error-codes';
import { checkShipLines, remainingOfLine, statusOfLines } from '../domain';
import type { FulfillmentLine, ProductQuantity } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderDocument } from '../model';
import { runAct, refuse, refuseMissing } from './act';
import { announceReleased } from './announce';
import { reportProgress } from './progress';

/** What a split made: the fulfillment order that may ship now, and what is still held. */
export interface Split {
    /** The units that arrived, free to ship. The held order itself when everything was covered. */
    released: FulfillmentOrderDocument;
    /** What stays on hold; `undefined` when the allocation covered the whole remainder. */
    held?: FulfillmentOrderDocument;
}

/**
 * The held order's lines once the allocated units have left it: each allocated line shrinks by what
 * moved, so what it carried is what it still owes.
 * @param lines - the held order's lines
 * @param allocated - the units that arrived
 */
const withoutAllocated = (
    lines: readonly FulfillmentLine[],
    allocated: readonly ProductQuantity[]
): FulfillmentLine[] => {
    const moved = new Map(allocated.map(({ productId, quantity }) => [productId, quantity]));
    return lines.map((line) => ({
        productId: line.productId,
        title: line.title,
        quantity: line.quantity - (moved.get(line.productId) ?? 0),
        shippedQuantity: line.shippedQuantity,
        cancelledQuantity: line.cancelledQuantity
    }));
};

/**
 * The units that arrived, as the new fulfillment order's lines: nothing shipped, nothing cancelled.
 * @param held - the held order
 * @param allocated - the units that arrived
 */
const allocatedLines = (
    held: FulfillmentOrderDocument,
    allocated: readonly ProductQuantity[]
): FulfillmentLine[] =>
    allocated.map(({ productId, quantity }) => ({
        productId,
        title: held.lines.find((line) => line.productId === productId)?.title ?? '',
        quantity,
        shippedQuantity: 0,
        cancelledQuantity: 0
    }));

/**
 * The split itself, in the allocation's transaction.
 * @param fulfillmentOrderId - the fulfillment order held for stock
 * @param allocated - the units that arrived, per product
 * @param session - the act's transaction
 */
const splitAct = async (
    fulfillmentOrderId: string,
    allocated: readonly ProductQuantity[],
    session: ClientSession
): Promise<Split> => {
    const held = await fulfillmentOrderRepository.findInSession(fulfillmentOrderId, session);
    if (!held) return refuseMissing('delivery.fulfillment-order-not-found');
    if (
        held.status !== FulfillmentOrderStatus.on_hold ||
        held.holdReason !== FulfillmentHoldReason.awaiting_stock
    )
        return refuse(409, ERROR_CODES.DELIVERY_NOT_RELEASABLE, 'delivery.not-releasable');

    const verdict = checkShipLines(held.lines, [...allocated]);
    if (!verdict.ok)
        return refuse(422, ERROR_CODES.DELIVERY_LINES_INVALID, 'delivery.lines-invalid');
    const units = verdict.lines;

    const covers = held.lines.every((line) => {
        const taken = units.find(({ productId }) => productId === line.productId)?.quantity ?? 0;
        return taken === remainingOfLine(line);
    });

    // Everything that was waiting for stock arrived: the hold simply ends, no second order needed.
    if (covers) {
        const released = await fulfillmentOrderRepository.claim(
            fulfillmentOrderId,
            held.revision,
            { status: statusOfLines(held.lines, false), unset: ['holdReason', 'holdNote'] },
            session
        );
        if (!released)
            return refuse(409, ERROR_CODES.DELIVERY_NOT_RELEASABLE, 'delivery.not-releasable');
        await reportProgress(String(released.orderId), session);
        await announceReleased(released, session);
        return { released };
    }

    const remaining = withoutAllocated(held.lines, units);
    const stillHeld = await fulfillmentOrderRepository.claim(
        fulfillmentOrderId,
        held.revision,
        { lines: remaining, status: statusOfLines(remaining, true) },
        session
    );
    if (!stillHeld)
        return refuse(409, ERROR_CODES.DELIVERY_NOT_RELEASABLE, 'delivery.not-releasable');

    const siblings = await fulfillmentOrderRepository.findByOrderId(String(held.orderId), session);
    const lines = allocatedLines(held, units);
    const released = await fulfillmentOrderRepository.create(
        {
            orderId: held.orderId,
            number: Math.max(...siblings.map(({ number }) => number)) + 1,
            kind: held.kind,
            status: statusOfLines(lines, false),
            lines,
            revision: 0,
            ...(held.agreedAt ? { agreedAt: held.agreedAt } : {}),
            ...(held.expectedAt ? { expectedAt: held.expectedAt } : {})
        },
        session
    );
    await reportProgress(String(held.orderId), session);
    await announceReleased(released, session);
    return { released, held: stillHeld };
};

/**
 * Split a fulfillment order held for stock: the units that arrived move to a new `open`
 * fulfillment order; the rest stays held. When the arrival covers everything the hold simply ends.
 * Atomic with the order's summary and the `fulfillment_order.released` event.
 *
 * @param fulfillmentOrderId - the fulfillment order held for stock
 * @param allocated - the units that arrived, per product; never more than remains of each
 * @returns the split, or `undefined` when nothing could be released — the fulfillment order is
 *   gone, its order was cancelled, it is not held for stock, or the allocation asks for more than
 *   remains
 */
export const splitForAllocation = (
    fulfillmentOrderId: string,
    allocated: readonly ProductQuantity[]
): Promise<Split | undefined> =>
    fulfillmentOrderRepository.findById(fulfillmentOrderId).then((found) => {
        if (!found) return undefined;

        return orderService.getById(String(found.orderId)).then((order) => {
            // A cancelled order has nothing left to release.
            if (!order || order.status === 'cancelled') return undefined;
            return runAct((session) => splitAct(fulfillmentOrderId, allocated, session)).then(
                (result) => (result.refused ? undefined : result.value)
            );
        });
    });
