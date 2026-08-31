/**
 * @module
 * Domain events this module emits — declared by augmenting the kernel's payload map, so the
 * catalogue grows with the modules that own events and no shared file enumerates domains. Exactly
 * one: stock changes aren't events (see `products/events.ts`), since the counter and the row
 * explaining it are one write. A hold timing out is different — `orders` must cancel the order,
 * but already imports this module, so the event avoids importing back and forming a cycle.
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
    }
}

/**
 * The event name, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const RESERVATION_EXPIRED = 'inventory.reservation_expired';
