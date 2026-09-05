/**
 * @module
 * Domain events this module emits, added by augmenting the kernel's payload map rather than
 * editing it, so the catalogue grows with the modules that own the events. `orders` sits low in
 * the dependency graph — payments and delivery depend on it, never the reverse — so announcing
 * is the only way it can tell them anything.
 */

import type { OrderStatus } from '@types';

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A cancel went through; stock is already back on the shelf. Emitted AFTER the write, since
         * the `$in` guard already guarantees at-most-once.
         *
         * `refund` carries the policy with the fact rather than letting the listener infer it: a
         * customer cancelling is owed their money, an operator cancelling may not be.
         */
        'order.cancelled': { orderId: string; refund: boolean };

        /**
         * An order's status moved, whoever moved it. Listeners filter on `to`; the event doesn't
         * know who cares.
         */
        'order.status_changed': { orderId: string; from: OrderStatus; to: OrderStatus };
    }
}

/** Exported so an emitter and its listeners share one spelling instead of duplicated literals. */
export const ORDER_CANCELLED = 'order.cancelled';

/** See `DomainEventMap['order.status_changed']` above. */
export const ORDER_STATUS_CHANGED = 'order.status_changed';
