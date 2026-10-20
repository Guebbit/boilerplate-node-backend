/**
 * @module
 * Writing delivery's events to the outbox, inside the act's transaction, and the matching row on
 * the order's timeline — the same transaction, so the history commits with the fact it narrates.
 * A row carries ids and codes, never the hold note: that text is reaped on its own clock.
 */

import type { ClientSession } from 'mongoose';
import { enqueueOutboxEvent } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { holdNeedsBuyerNotice, holdNoticeOf } from '../domain';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import {
    FULFILLMENT_ORDER_CANCELLED,
    FULFILLMENT_ORDER_DELAYED,
    FULFILLMENT_ORDER_HELD,
    FULFILLMENT_ORDER_HOLD_NOTICED,
    FULFILLMENT_ORDER_RELEASED,
    type FulfillmentOrderDelayed,
    SHIPMENT_DELIVERED,
    SHIPMENT_SHIPPED
} from '../events';

/**
 * The payload both `shipment.*` events carry.
 * @param shipment - the shipment
 */
const shipmentPayload = (shipment: ShipmentDocument) => ({
    orderId: String(shipment.orderId),
    shipmentId: String(shipment._id),
    fulfillmentOrderId: String(shipment.fulfillmentOrderId),
    lines: shipment.lines.map(({ productId, quantity }) => ({ productId, quantity }))
});

/**
 * Write `shipment.shipped`, keyed on the order so its events stay in order, and the timeline's
 * `shipment_shipped`.
 * @param shipment - the shipment that left
 * @param session - the act's transaction
 * @param actor - the staff member who shipped it, when a person did
 * @param remainingUnits - units still to come in later shipments; omitted for a digital fulfilment
 */
export const announceShipped = (
    shipment: ShipmentDocument,
    session: ClientSession,
    actor?: string | null,
    remainingUnits?: number
): Promise<void> =>
    orderService
        .appendTimeline(
            String(shipment.orderId),
            {
                type: 'shipment_shipped',
                actor,
                at: shipment.shippedAt,
                data: {
                    shipmentId: String(shipment._id),
                    fulfillmentOrderId: String(shipment.fulfillmentOrderId),
                    number: shipment.number,
                    ...(shipment.trackingCode ? { trackingCode: shipment.trackingCode } : {})
                }
            },
            session
        )
        .then(() =>
            enqueueOutboxEvent(
                SHIPMENT_SHIPPED,
                {
                    ...shipmentPayload(shipment),
                    ...(remainingUnits === undefined ? {} : { remainingUnits })
                },
                String(shipment.orderId),
                session
            )
        );

/**
 * Write `shipment.delivered`, keyed on the order so its events stay in order, and the timeline's
 * `shipment_delivered`.
 * @param shipment - the shipment that arrived
 * @param session - the act's transaction
 * @param actor - the staff member who recorded the arrival, when a person did
 */
export const announceDelivered = (
    shipment: ShipmentDocument,
    session: ClientSession,
    actor?: string | null
): Promise<void> =>
    orderService
        .appendTimeline(
            String(shipment.orderId),
            {
                type: 'shipment_delivered',
                actor,
                at: shipment.deliveredAt,
                data: {
                    shipmentId: String(shipment._id),
                    fulfillmentOrderId: String(shipment.fulfillmentOrderId),
                    number: shipment.number
                }
            },
            session
        )
        .then(() =>
            enqueueOutboxEvent(
                SHIPMENT_DELIVERED,
                shipmentPayload(shipment),
                String(shipment.orderId),
                session
            )
        );

/**
 * Write `fulfillment_order.hold_noticed` when the hold gives the buyer something to do or read: an
 * address to check, or a message staff wrote for them. Same transaction as the hold, so the mail
 * and the inbox row exist exactly when the hold does.
 * @param fulfillmentOrder - the held fulfillment order
 * @param order - its order, for the buyer
 * @param session - the act's transaction
 */
const noticeTheBuyer = (
    fulfillmentOrder: FulfillmentOrderDocument,
    order: OrderDocument,
    session: ClientSession
): Promise<void> => {
    const { holdReason, holdMessage } = fulfillmentOrder;
    if (!holdReason || !holdNeedsBuyerNotice(holdReason, holdMessage)) return Promise.resolve();

    const notice = holdNoticeOf(holdReason);
    return enqueueOutboxEvent(
        FULFILLMENT_ORDER_HOLD_NOTICED,
        {
            orderId: String(fulfillmentOrder.orderId),
            fulfillmentOrderId: String(fulfillmentOrder._id),
            ...(order.userId ? { userId: String(order.userId) } : {}),
            notice: notice === 'check_address' ? 'check_address' : 'delayed',
            ...(holdMessage ? { message: holdMessage } : {})
        },
        String(fulfillmentOrder.orderId),
        session
    );
};

/**
 * Write `fulfillment_order.held`, and the timeline's `fulfillment_held` with the reason code (the
 * note staff typed stays on the fulfillment order, where it has its own retention clock).
 * @param fulfillmentOrder - the fulfillment order now on hold
 * @param order - its order, for the buyer a notice goes to
 * @param session - the act's transaction
 * @param actor - the staff member who held it
 */
export const announceHeld = (
    fulfillmentOrder: FulfillmentOrderDocument,
    order: OrderDocument,
    session: ClientSession,
    actor?: string | null
): Promise<void> =>
    orderService
        .appendTimeline(
            String(fulfillmentOrder.orderId),
            {
                type: 'fulfillment_held',
                actor,
                data: {
                    fulfillmentOrderId: String(fulfillmentOrder._id),
                    reason: fulfillmentOrder.holdReason ?? 'other'
                }
            },
            session
        )
        .then(() =>
            enqueueOutboxEvent(
                FULFILLMENT_ORDER_HELD,
                {
                    orderId: String(fulfillmentOrder.orderId),
                    fulfillmentOrderId: String(fulfillmentOrder._id),
                    reason: fulfillmentOrder.holdReason ?? 'other'
                },
                String(fulfillmentOrder.orderId),
                session
            )
        )
        .then(() => noticeTheBuyer(fulfillmentOrder, order, session));

/**
 * Write `fulfillment_order.released`, and the timeline's `fulfillment_released`.
 * @param fulfillmentOrder - the fulfillment order no longer on hold
 * @param session - the act's transaction
 * @param actor - the staff member who released it; absent when the arrival of stock did
 */
export const announceReleased = (
    fulfillmentOrder: FulfillmentOrderDocument,
    session: ClientSession,
    actor?: string | null
): Promise<void> =>
    orderService
        .appendTimeline(
            String(fulfillmentOrder.orderId),
            {
                type: 'fulfillment_released',
                actor,
                data: { fulfillmentOrderId: String(fulfillmentOrder._id) }
            },
            session
        )
        .then(() =>
            enqueueOutboxEvent(
                FULFILLMENT_ORDER_RELEASED,
                {
                    orderId: String(fulfillmentOrder.orderId),
                    fulfillmentOrderId: String(fulfillmentOrder._id)
                },
                String(fulfillmentOrder.orderId),
                session
            )
        );

/**
 * Write `fulfillment_order.cancelled`.
 * @param fulfillmentOrder - the fulfillment order whose remainder was cancelled
 * @param session - the act's transaction
 */
export const announceCancelled = (
    fulfillmentOrder: FulfillmentOrderDocument,
    session: ClientSession
): Promise<void> =>
    enqueueOutboxEvent(
        FULFILLMENT_ORDER_CANCELLED,
        {
            orderId: String(fulfillmentOrder.orderId),
            fulfillmentOrderId: String(fulfillmentOrder._id)
        },
        String(fulfillmentOrder.orderId),
        session
    );

/**
 * Write the timeline's `remainder_cancelled` for a remainder cancelled after something shipped.
 * Not part of {@link announceCancelled}: that one also runs when a whole cancelled order takes its
 * fulfillment orders with it, and the order's own `cancelled` row already says so.
 * @param fulfillmentOrder - the fulfillment order whose remainder was cancelled
 * @param session - the act's transaction
 */
export const recordRemainderCancelled = (
    fulfillmentOrder: FulfillmentOrderDocument,
    session: ClientSession
): Promise<void> =>
    orderService.appendTimeline(
        String(fulfillmentOrder.orderId),
        {
            type: 'remainder_cancelled',
            data: { fulfillmentOrderId: String(fulfillmentOrder._id) }
        },
        session
    );

/**
 * Write `fulfillment_order.delayed`, keyed on the order so its events stay in order, and the
 * timeline's `delay_notice_sent` with the reason and the date now expected.
 * @param delayed - what the buyer is told
 * @param session - the act's transaction
 */
export const announceDelayed = (
    delayed: FulfillmentOrderDelayed,
    session: ClientSession
): Promise<void> =>
    orderService
        .appendTimeline(
            delayed.orderId,
            {
                type: 'delay_notice_sent',
                data: {
                    fulfillmentOrderId: delayed.fulfillmentOrderId,
                    reason: delayed.reason,
                    ...(delayed.expectedAt ? { expectedAt: delayed.expectedAt } : {})
                }
            },
            session
        )
        .then(() =>
            enqueueOutboxEvent(FULFILLMENT_ORDER_DELAYED, delayed, delayed.orderId, session)
        );
