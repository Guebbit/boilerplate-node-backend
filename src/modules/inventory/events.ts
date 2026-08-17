/**
 * Domain events this module emits.
 *
 * Declared by augmenting the kernel's payload map, so the catalogue of events grows with the
 * modules that own them and no shared file enumerates domains.
 *
 * There is exactly one, and it is the only thing here that is genuinely after-the-fact. Stock
 * changes are not events (see `products/events.ts`): a counter and the row explaining it are one
 * write. A hold timing out is different — the sweep frees the units itself, but cancelling the
 * ORDER belongs to `orders`, which already imports this module, so an import back would be a
 * cycle. It is announced instead.
 */

declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A hold's window closed before the order was paid for, and its units have been
         * released.
         *
         * Emitted AFTER the release, one per expired hold, by `runReservationSweep`. Past tense
         * on purpose: the stock is already back on the shelf by the time anyone hears this, so a
         * listener is compensating for a fact rather than approving a plan. The listener that
         * matters is `orders`, which cancels the order — leaving it `pending` with its stock
         * gone would be the shop telling a customer they have bought something they have not.
         */
        'inventory.reservation_expired': { orderId: string };
    }
}

/**
 * The event name, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const RESERVATION_EXPIRED = 'inventory.reservation_expired';
