/**
 * @module
 * Domain events this module emits — declared by augmenting the kernel's payload map, so the
 * catalogue grows with the modules that own events and no shared file enumerates domains. Two:
 * stock changes aren't events (see `products/events.ts`), since the counter and the row
 * explaining it are one write. A hold timing out is different — `orders` must cancel the order,
 * but already imports this module, so the event avoids importing back and forming a cycle. Stock
 * allocated to a paid preorder is the other: `delivery` must release the fulfillment order that
 * waits for it, and imports this module only for the event's name.
 *
 * See: docs/modules/inventory.md
 */

/** Registers this module's event payload shape into the kernel's `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A hold's window closed before the order was paid for; its units are already released.
         * Emitted AFTER the release, past tense on purpose — the listener (`orders`) cancels the
         * order rather than approving a plan, so it doesn't stay `pending` with its stock gone.
         */
        'inventory.reservation_expired': { orderId: string };

        /**
         * Stock arrived for a paid preorder: some of an order's preorder units of one product just
         * became real, set-aside units. Written through the outbox in the receipt's own
         * transaction, so it exists exactly when the allocation does.
         *
         * `waiting` is what is STILL a preorder claim on that order for that product after this
         * allocation — a state, not a delta, so a redelivery is harmless: `delivery` releases
         * whatever it holds beyond `waiting` and, the second time, finds nothing beyond it. `0`
         * means the order's preorder units of that product are all covered.
         */
        'inventory.backorder_allocated': { orderId: string; productId: string; waiting: number };

        /**
         * A payment landed on a hold that had been released, and its units were taken again inside
         * the payment's transaction. The counters moved there, where the catalogue's stock copy
         * cannot be written (it would not roll back), so this module refreshes it on the
         * announcement. Eventual is fine, and a redelivery is harmless: it only re-reads.
         */
        'inventory.stock_retaken': { orderId: string; productIds: string[] };
    }
}

/**
 * The event name, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const RESERVATION_EXPIRED = 'inventory.reservation_expired';

/** See `DomainEventMap['inventory.backorder_allocated']` above for what it carries and who listens. */
export const PREORDER_ALLOCATED = 'inventory.backorder_allocated';

/** See `DomainEventMap['inventory.stock_retaken']` above; announced by the payment's own transaction. */
export const STOCK_RETAKEN = 'inventory.stock_retaken';
