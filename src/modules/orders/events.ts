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
         * An order's status moved, whoever moved it — a status-only admin override
         * (`services/override.ts`) included, indistinguishable here from an ordinary system move.
         * Listeners filter on `to`; the event doesn't know or care who moved it or through which
         * door, only that it moved. Webhooks fire either way — a subscriber cares that the status
         * changed, not by which door.
         */
        'order.status_changed': {
            orderId: string;
            from: OrderStatus;
            to: OrderStatus;
        };

        /**
         * A new order was written — emitted by `services/place.ts`'s `placeOrder`, the one
         * function that writes a new order, so this fires exactly once per order regardless of
         * which caller (the admin create, the storefront checkout) reached it. `webhooks` and the
         * invoice-PDF pipeline are the listeners that need this fact as an event rather than as
         * audit/analytics noise.
         */
        'order.created': { orderId: string };
    }
}

/** Exported so an emitter and its listeners share one spelling instead of duplicated literals. */
export const ORDER_CANCELLED = 'order.cancelled';

/** See `DomainEventMap['order.status_changed']` above. */
export const ORDER_STATUS_CHANGED = 'order.status_changed';

/** See `DomainEventMap['order.created']` above. */
export const ORDER_CREATED = 'order.created';
