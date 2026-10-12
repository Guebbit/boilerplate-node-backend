/**
 * @module
 * The order events that ride the transactional outbox. Each status write hands one of these to
 * `announceInTransaction`, so the event row commits with the write or not at all.
 *
 * See: docs/tools/outbox.md
 */

import type { OutboxAnnouncement } from '@kernel/outbox';
import type { OrderStatus } from '@types';
import { ORDER_CREATED, ORDER_STATUS_CHANGED, ORDER_STATUS_OVERRIDDEN } from '../events';

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

/**
 * The `order.status_overridden` announcement for one landed override, written beside its
 * `order.status_changed` so `delivery` can bring its shipments in step at the override's own
 * instant.
 *
 * @param orderId - the order that was overridden
 * @param from - the status it was moved from
 * @param to - the status it was moved to
 * @param at - the override's instant, ISO-serialised in the payload
 */
export const statusOverriddenEvent = (
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    at: Date
): OutboxAnnouncement<typeof ORDER_STATUS_OVERRIDDEN> => ({
    name: ORDER_STATUS_OVERRIDDEN,
    payload: { orderId, from, to, at: at.toISOString(), mode: 'status' },
    aggregateId: orderId
});
