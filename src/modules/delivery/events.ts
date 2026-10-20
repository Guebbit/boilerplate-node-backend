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

/** The payload of `shipment.shipped`: the shared one, plus what the buyer's mail says. */
export interface ShipmentShippedPayload extends ShipmentEventPayload {
    /**
     * Units still to come in later shipments. Absent for a digital fulfilment, which is born
     * delivered: its arrival mail is the only one the buyer gets. Internal — the webhook omits it.
     */
    remainingUnits?: number;
}

/** What a `fulfillment_order.delayed` event tells: the dates, and whether the buyer must answer. */
export interface FulfillmentOrderDelayed {
    orderId: string;
    fulfillmentOrderId: string;
    /** The buyer; absent once the account was erased, so there is no inbox to write to. */
    userId?: string;
    /** The product titles waiting, as the order froze them. */
    titles: string[];
    /** The date promised when ordering (ISO 8601). */
    agreedAt: string;
    /** The date now expected, absent when there is none (the date was cleared). */
    expectedAt?: string;
    /** `moved`: the date was changed. `due`: the expected date is two days away (or past) and there is still no stock. */
    reason: 'moved' | 'due';
    /** Whether silence cancels: the buyer must say "keep waiting" by `answerBy`. */
    needsAnswer: boolean;
    /** When silence turns into a cancel (ISO 8601); present exactly when `needsAnswer`. */
    answerBy?: string;
    /**
     * The date the buyer already agreed to wait for (ISO 8601); present only on a RENEWED question,
     * so the mail can say what the new deadline follows from. Internal: the webhook omits it.
     */
    acceptedUntil?: string;
}

/**
 * What a `fulfillment_order.hold_noticed` event tells: a hold the buyer can act on or should read
 * about. Buyer-safe by construction: the notice, never staff's reason or note.
 */
export interface FulfillmentOrderHoldNoticed {
    orderId: string;
    fulfillmentOrderId: string;
    /** The buyer; absent once the account was erased, so there is no inbox to write to. */
    userId?: string;
    /** `check_address` when the address needs a look, else `delayed`. */
    notice: 'check_address' | 'delayed';
    /** What staff wrote for the buyer, if anything. */
    message?: string;
}

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A shipment left: some or all of an order's goods. Fires once per shipment, so an order
         * shipped in two goes fires it twice. Not fired for the forced shipments an admin status
         * override brings in step: nothing left that anyone recorded. This module mails the buyer
         * from it (`./services/notify.ts`).
         */
        'shipment.shipped': ShipmentShippedPayload;

        /** A shipment arrived. A digital fulfilment fires it right after `shipment.shipped`. */
        'shipment.delivered': ShipmentEventPayload;

        /** Staff put a fulfillment order on hold, or the stock it awaits did not arrive. */
        'fulfillment_order.held': { orderId: string; fulfillmentOrderId: string; reason: string };

        /**
         * A hold the buyer has something to do or read about: an address to check, or a message
         * staff wrote for them. A bare delay and `awaiting_stock` fire nothing. `notifications`
         * turns it into an inbox row (`fulfillment-held`); this module mails the same from it.
         */
        'fulfillment_order.hold_noticed': FulfillmentOrderHoldNoticed;

        /** A hold ended and the fulfillment order may ship. */
        'fulfillment_order.released': { orderId: string; fulfillmentOrderId: string };

        /** A fulfillment order's remainder was cancelled, or its order was. */
        'fulfillment_order.cancelled': { orderId: string; fulfillmentOrderId: string };

        /**
         * A waiting preorder's buyer was told its date moved or passed (PRODUCT_STATES P5). Written
         * in the same transaction as the change to the fulfillment order. `notifications` turns it
         * into an inbox row, `fulfillment-delayed` or, when the buyer must answer,
         * `fulfillment-confirm-wait`; the email is sent by this module from the same event.
         */
        'fulfillment_order.delayed': FulfillmentOrderDelayed;

        /**
         * A buyer was asked to keep waiting and the window closed in silence: the fulfillment order
         * is to be cancelled and refunded. `returns` listens, since only it reaches money and stock
         * together. Re-announced by the daily sweep until the cancel has landed, so a listener must
         * be idempotent.
         */
        'fulfillment_order.wait_expired': { orderId: string; fulfillmentOrderId: string };
    }
}

/** See `DomainEventMap['shipment.shipped']` above. */
export const SHIPMENT_SHIPPED = 'shipment.shipped';

/** See `DomainEventMap['shipment.delivered']` above. */
export const SHIPMENT_DELIVERED = 'shipment.delivered';

/** See `DomainEventMap['fulfillment_order.held']` above. */
export const FULFILLMENT_ORDER_HELD = 'fulfillment_order.held';

/** See `DomainEventMap['fulfillment_order.hold_noticed']` above. */
export const FULFILLMENT_ORDER_HOLD_NOTICED = 'fulfillment_order.hold_noticed';

/** See `DomainEventMap['fulfillment_order.released']` above. */
export const FULFILLMENT_ORDER_RELEASED = 'fulfillment_order.released';

/** See `DomainEventMap['fulfillment_order.cancelled']` above. */
export const FULFILLMENT_ORDER_CANCELLED = 'fulfillment_order.cancelled';

/** See `DomainEventMap['fulfillment_order.delayed']` above. */
export const FULFILLMENT_ORDER_DELAYED = 'fulfillment_order.delayed';

/** See `DomainEventMap['fulfillment_order.wait_expired']` above. */
export const FULFILLMENT_ORDER_WAIT_EXPIRED = 'fulfillment_order.wait_expired';
