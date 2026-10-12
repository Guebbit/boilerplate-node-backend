/**
 * @module
 * Domain events this module emits, added by augmenting the kernel's payload map — see
 * `modules/orders/events.ts` for why augmentation rather than a central list. Every one rides the
 * transactional outbox, written in the transaction of the act that caused it, so it exists exactly
 * when the act does. `shipment.*` is projected into `webhooks`' public catalogue by `module.ts`'s
 * `publicEvents`; the `fulfillment_order.*` events are internal.
 */

/** What a shipment carries, per product — the lines of a `shipment.*` payload. */
export interface ShipmentEventLine {
    productId: string;
    quantity: number;
}

/** The payload of both `shipment.*` events. */
export interface ShipmentEventPayload {
    orderId: string;
    shipmentId: string;
    fulfillmentOrderId: string;
    lines: ShipmentEventLine[];
}

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A shipment left: some or all of an order's goods. Fires once per shipment, so an order
         * shipped in two goes fires it twice. Not fired for the forced shipments an admin status
         * override brings in step: nothing left that anyone recorded.
         */
        'shipment.shipped': ShipmentEventPayload;

        /** A shipment arrived. A digital fulfilment fires it right after `shipment.shipped`. */
        'shipment.delivered': ShipmentEventPayload;

        /** Staff put a fulfillment order on hold, or the stock it awaits did not arrive. */
        'fulfillment_order.held': { orderId: string; fulfillmentOrderId: string; reason: string };

        /** A hold ended and the fulfillment order may ship. */
        'fulfillment_order.released': { orderId: string; fulfillmentOrderId: string };

        /** A fulfillment order's remainder was cancelled, or its order was. */
        'fulfillment_order.cancelled': { orderId: string; fulfillmentOrderId: string };
    }
}

/** See `DomainEventMap['shipment.shipped']` above. */
export const SHIPMENT_SHIPPED = 'shipment.shipped';

/** See `DomainEventMap['shipment.delivered']` above. */
export const SHIPMENT_DELIVERED = 'shipment.delivered';

/** See `DomainEventMap['fulfillment_order.held']` above. */
export const FULFILLMENT_ORDER_HELD = 'fulfillment_order.held';

/** See `DomainEventMap['fulfillment_order.released']` above. */
export const FULFILLMENT_ORDER_RELEASED = 'fulfillment_order.released';

/** See `DomainEventMap['fulfillment_order.cancelled']` above. */
export const FULFILLMENT_ORDER_CANCELLED = 'fulfillment_order.cancelled';
