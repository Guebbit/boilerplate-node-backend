/**
 * Domain events this module emits.
 *
 * Declared by augmenting the kernel's payload map rather than by editing it, so the catalogue of
 * events grows with the modules that own them and no shared file enumerates domains.
 *
 * Both events exist for the same architectural reason: `orders` sits low in the DAG — payments
 * and delivery depend on it, never the reverse — so the only way an order can tell them anything
 * is by announcing it. The listeners' work (a refund, a shipment) belongs to the listeners.
 */

import type { OrderStatus } from '@types';

declare module '@kernel/events' {
    interface IDomainEventMap {
        /**
         * A customer's cancel went through — the conditional status move matched, the stock is
         * back on the shelf. Emitted AFTER the write: a cancellation is a fact by the time
         * anyone compensates for it, and the `$in` guard already guarantees at-most-once.
         */
        'order.cancelled': { orderId: string };

        /**
         * An order's status moved, whoever moved it — the admin write, a payment landing, the
         * courier job. Listeners filter on `to`; the event does not know who cares.
         */
        'order.status_changed': { orderId: string; from: OrderStatus; to: OrderStatus };
    }
}

/**
 * The event names, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const ORDER_CANCELLED = 'order.cancelled';
export const ORDER_STATUS_CHANGED = 'order.status_changed';
