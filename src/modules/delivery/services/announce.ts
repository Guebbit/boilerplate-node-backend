/**
 * @module
 * Writing delivery's events to the outbox, inside the act's transaction.
 */

import type { ClientSession } from 'mongoose';
import { enqueueOutboxEvent } from '@kernel/outbox';
import type { FulfillmentOrderDocument, ShipmentDocument } from '../model';
import {
    FULFILLMENT_ORDER_CANCELLED,
    FULFILLMENT_ORDER_DELAYED,
    FULFILLMENT_ORDER_HELD,
    FULFILLMENT_ORDER_RELEASED,
    FULFILLMENT_ORDER_WAIT_EXPIRED,
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
 * Write `shipment.shipped`, keyed on the order so its events stay in order.
 * @param shipment - the shipment that left
 * @param session - the act's transaction
 */
export const announceShipped = (
    shipment: ShipmentDocument,
    session: ClientSession
): Promise<void> =>
    enqueueOutboxEvent(
        SHIPMENT_SHIPPED,
        shipmentPayload(shipment),
        String(shipment.orderId),
        session
    );

/**
 * Write `shipment.delivered`, keyed on the order so its events stay in order.
 * @param shipment - the shipment that arrived
 * @param session - the act's transaction
 */
export const announceDelivered = (
    shipment: ShipmentDocument,
    session: ClientSession
): Promise<void> =>
    enqueueOutboxEvent(
        SHIPMENT_DELIVERED,
        shipmentPayload(shipment),
        String(shipment.orderId),
        session
    );

/**
 * Write `fulfillment_order.held`.
 * @param fulfillmentOrder - the fulfillment order now on hold
 * @param session - the act's transaction
 */
export const announceHeld = (
    fulfillmentOrder: FulfillmentOrderDocument,
    session: ClientSession
): Promise<void> =>
    enqueueOutboxEvent(
        FULFILLMENT_ORDER_HELD,
        {
            orderId: String(fulfillmentOrder.orderId),
            fulfillmentOrderId: String(fulfillmentOrder._id),
            reason: fulfillmentOrder.holdReason ?? 'other'
        },
        String(fulfillmentOrder.orderId),
        session
    );

/**
 * Write `fulfillment_order.released`.
 * @param fulfillmentOrder - the fulfillment order no longer on hold
 * @param session - the act's transaction
 */
export const announceReleased = (
    fulfillmentOrder: FulfillmentOrderDocument,
    session: ClientSession
): Promise<void> =>
    enqueueOutboxEvent(
        FULFILLMENT_ORDER_RELEASED,
        {
            orderId: String(fulfillmentOrder.orderId),
            fulfillmentOrderId: String(fulfillmentOrder._id)
        },
        String(fulfillmentOrder.orderId),
        session
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
 * Write `fulfillment_order.delayed`, keyed on the order so its events stay in order.
 * @param delayed - what the buyer is told
 * @param session - the act's transaction
 */
export const announceDelayed = (
    delayed: FulfillmentOrderDelayed,
    session: ClientSession
): Promise<void> =>
    enqueueOutboxEvent(FULFILLMENT_ORDER_DELAYED, delayed, delayed.orderId, session);

/**
 * Write `fulfillment_order.wait_expired`, keyed on the order so its events stay in order.
 * @param fulfillmentOrder - the fulfillment order whose buyer never answered
 * @param session - the act's transaction
 */
export const announceWaitExpired = (
    fulfillmentOrder: FulfillmentOrderDocument,
    session: ClientSession
): Promise<void> =>
    enqueueOutboxEvent(
        FULFILLMENT_ORDER_WAIT_EXPIRED,
        {
            orderId: String(fulfillmentOrder.orderId),
            fulfillmentOrderId: String(fulfillmentOrder._id)
        },
        String(fulfillmentOrder.orderId),
        session
    );
