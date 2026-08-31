/**
 * @module
 * Domain events this module emits — declared by augmenting the kernel's payload map, so the
 * catalogue grows with the modules that own events and no shared file enumerates domains.
 *
 * Exactly one. Stock changes aren't events (see `products/events.ts`) — the counter and the row
 * explaining it are one write. A hold timing out is different: `orders` must cancel the order,
 * but it already imports this module, so the event avoids importing back and forming a cycle.
 *
 * See: docs/modules/inventory.md
 */

/** Registers this module's event payload shape into the kernel's `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A hold's window closed before the order was paid for, and its units are already
         * released.
         *
         * Emitted AFTER the release, by `runReservationSweep` — past tense on purpose: the
         * listener (`orders`) is compensating for a fact, not approving a plan, and cancels the
         * order so it doesn't stay `pending` with its stock gone.
         */
        'inventory.reservation_expired': { orderId: string };
    }
}

/**
 * The event name, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const RESERVATION_EXPIRED = 'inventory.reservation_expired';
