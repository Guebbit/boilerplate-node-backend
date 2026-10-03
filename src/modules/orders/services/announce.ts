/**
 * @module
 * The order events that ride the transactional outbox. Each status write hands one of these to
 * `announceInTransaction`, so the event row commits with the write or not at all.
 *
 * See: docs/tools/outbox.md
 */

import type { OutboxAnnouncement } from '@kernel/outbox';
import type { OrderStatus } from '@types';
import { ORDER_CREATED, ORDER_STATUS_CHANGED } from '../events';

/**
 * The `order.status_changed` announcement for one landed status move.
 *
 * Every order's events share the order id as their aggregate, so per-order ordering holds
 * across `created`, `status_changed` and `cancelled`.
 *
 * @param orderId - the order that moved
 * @param from - the status it moved from
 * @param to - the status it moved to
 */
export const statusChangedEvent = (
    orderId: string,
    from: OrderStatus,
    to: OrderStatus
): OutboxAnnouncement<typeof ORDER_STATUS_CHANGED> => ({
    name: ORDER_STATUS_CHANGED,
    payload: { orderId, from, to },
    aggregateId: orderId
});

/**
 * The `order.created` announcement for a newly written order.
 *
 * @param orderId - the order that was written
 */
export const createdEvent = (orderId: string): OutboxAnnouncement<typeof ORDER_CREATED> => ({
    name: ORDER_CREATED,
    payload: { orderId },
    aggregateId: orderId
});
