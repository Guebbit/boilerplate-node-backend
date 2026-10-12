/**
 * @module
 * Letting a paid preorder's fulfillment order go when its stock arrives. `inventory` allocates a
 * receipt to the paid preorders oldest payment first and announces what each order still waits for;
 * this is the listener that moves the matching units out of `awaiting_stock`, by
 * {@link splitForAllocation}.
 *
 * The event carries a STATE, not a delta (`waiting`: what the order still claims of that product),
 * so the listener is idempotent without remembering which events it saw. It releases what it holds
 * beyond `waiting`, and a redelivery finds nothing beyond it.
 *
 * See: docs/modules/delivery.md#a-short-stock-delivery
 */

import { FulfillmentHoldReason, FulfillmentOrderStatus } from '@types';
import { remainingOfLine } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderDocument } from '../model';
import { ensureFulfillmentOrders } from './ensure';
import { splitForAllocation } from './split';

/**
 * Units of one product still waiting for stock on a fulfillment order.
 * @param fulfillmentOrder - the fulfillment order
 * @param productId - the product
 */
const waitingOn = (fulfillmentOrder: FulfillmentOrderDocument, productId: string): number =>
    fulfillmentOrder.lines
        .filter((line) => line.productId === productId)
        .reduce((sum, line) => sum + remainingOfLine(line), 0);

/**
 * The order's fulfillment orders that hold this product for stock, earliest promised date first:
 * the units inventory allocated go to the buyer's oldest promise.
 *
 * @param orderId - the order
 * @param productId - the product whose stock arrived
 */
const heldFor = (orderId: string, productId: string): Promise<FulfillmentOrderDocument[]> =>
    fulfillmentOrderRepository
        .findByOrderId(orderId)
        .then((all) =>
            all
                .filter(
                    (one) =>
                        one.status === FulfillmentOrderStatus.on_hold &&
                        one.holdReason === FulfillmentHoldReason.awaiting_stock &&
                        waitingOn(one, productId) > 0
                )
                .toSorted(
                    (a, b) =>
                        (a.agreedAt?.getTime() ?? 0) - (b.agreedAt?.getTime() ?? 0) ||
                        a.number - b.number
                )
        );

/**
 * Release what `inventory` allocated: for each held fulfillment order of the product, oldest
 * promise first, move as many units as were allocated out of `awaiting_stock`.
 *
 * @param orderId - the order whose preorder was allocated
 * @param productId - the product that was allocated
 * @param waiting - what the order still claims of that product after the allocation
 */
export const releaseAllocated = (
    orderId: string,
    productId: string,
    waiting: number
): Promise<void> =>
    // The paid listener may not have made the fulfillment orders yet; the same idempotent create.
    ensureFulfillmentOrders(orderId)
        .then(() => heldFor(orderId, productId))
        .then(async (held) => {
            const total = held.reduce((sum, one) => sum + waitingOn(one, productId), 0);
            let toRelease = total - waiting;
            // One after another: each split rewrites the same order's summary.
            for (const one of held) {
                if (toRelease <= 0) break;
                const quantity = Math.min(waitingOn(one, productId), toRelease);
                await splitForAllocation(String(one._id), [{ productId, quantity }]);
                toRelease -= quantity;
            }
        });
