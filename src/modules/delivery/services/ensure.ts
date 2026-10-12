/**
 * @module
 * Making an order's fulfillment orders: by rule, when the order is paid. The `paid` listener is the
 * normal path; {@link ensureFulfillmentOrders} is the same idempotent create, run again on every read
 * and `start` of a paid order, because the outbox gives up after its last retry and a missing
 * fulfillment order would leave no ship door at all.
 *
 * See: docs/modules/delivery.md#when-they-are-made
 */

import { OrderStatus } from '@types';
import { orderService, isShippedItem } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { withTransaction } from '@infrastructure/runtime/database';
import { groupOrderLines, type GroupableLine } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import { reportProgress } from './progress';

/**
 * An order's lines as the grouping rule reads them, off the snapshot frozen at checkout. The
 * preorder flag and release date are read from the FROZEN line, never from the product at payment
 * time: a bank transfer can be paid a week after it was ordered.
 * @param order - the order
 */
const groupableLinesOf = (order: OrderDocument): GroupableLine[] =>
    order.items.map((item) => ({
        productId: String(item.product._id),
        title: item.product.title,
        quantity: item.quantity,
        ships: isShippedItem(item)
    }));

/**
 * The statuses whose goods are still to be handed over. `shipped` and `delivered` orders have had
 * their goods handed over by other means; making an `open` fulfillment order for them would offer
 * to ship goods twice.
 */
const FULFILLABLE: ReadonlySet<OrderStatus> = new Set([OrderStatus.paid, OrderStatus.processing]);

/**
 * Make the order's fulfillment orders if it has none yet, and report the summary — in one
 * transaction. Idempotent on `{ orderId, number }`: a retried listener, a read racing it, or the
 * safety net running after the listener all leave exactly one set.
 *
 * @param orderId - the order
 * @returns settles once the order has its fulfillment orders; does nothing for an order that is
 *   missing, not yet paid, cancelled, or already past dispatch
 */
export const ensureFulfillmentOrders = (orderId: string): Promise<void> =>
    orderService.getById(orderId).then((order) => {
        if (!order || !FULFILLABLE.has(order.status)) return undefined;

        return fulfillmentOrderRepository.findByOrderId(orderId).then((existing) => {
            if (existing.length > 0) return undefined;

            const drafts = groupOrderLines(groupableLinesOf(order));
            return withTransaction(async (session) => {
                // One after another: a transaction's session does not take parallel operations.
                for (const draft of drafts)
                    await fulfillmentOrderRepository.insertIfAbsent(orderId, draft, session);
                await reportProgress(orderId, session);
            });
        });
    });
