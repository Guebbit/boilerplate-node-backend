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
         * A cancel went through; stock is already back on the shelf. Written to the transactional
         * outbox in the cancel's own transaction (`./services/cancel.ts`), so it exists exactly when
         * the cancel does — the `$in` guard makes the write at-most-once, the relay makes delivery
         * at-least-once: a listener dedupes on `meta.eventId`.
         *
         * `refund` carries the policy with the fact rather than letting the listener infer it: a
         * customer cancelling is owed their money, an operator cancelling may not be.
         */
        'order.cancelled': { orderId: string; refund: boolean };

        /**
         * A cancelled order still owes its refund — split from `order.cancelled` so retrying the
         * one effect `payments` owes never re-announces the whole cancellation: a retry sweep that
         * re-sent `order.cancelled` just to nudge `payments` would duplicate the customer-facing
         * webhook every time a provider outage outlasted one pass.
         *
         * Internal only — no AsyncAPI channel carries this. Nothing outside this application needs
         * to know a refund was retried, only that the money eventually moved.
         */
        'order.refund_owed': { orderId: string };

        /**
         * An order's status moved, whoever moved it — a status-only admin override
         * (`services/override.ts`) included, indistinguishable here from an ordinary system move.
         * Listeners filter on `to`; the event doesn't know or care who moved it or through which
         * door, only that it moved. Webhooks fire either way — a subscriber cares that the status
         * changed, not by which door.
         *
         * Written to the transactional outbox in the transaction of the status write itself
         * (`./services/announce.ts`): at-least-once, so a listener dedupes on `meta.eventId`.
         */
        'order.status_changed': {
            orderId: string;
            from: OrderStatus;
            to: OrderStatus;
        };

        /**
         * A new order was written — emitted by `services/place.ts`'s `placeOrder`, the one
         * function that writes a new order, so this fires exactly once per order regardless of
         * which caller (the admin create, the storefront checkout) reached it. `webhooks` is the
         * listener that needs this fact as an event rather than as audit/analytics noise. Written to
         * the transactional outbox with the order itself, so a placed order is always announced.
         */
        'order.created': { orderId: string };
    }
}

/** Exported so an emitter and its listeners share one spelling instead of duplicated literals. */
export const ORDER_CANCELLED = 'order.cancelled';

/** See `DomainEventMap['order.refund_owed']` above. */
export const ORDER_REFUND_OWED = 'order.refund_owed';

/** See `DomainEventMap['order.status_changed']` above. */
export const ORDER_STATUS_CHANGED = 'order.status_changed';

/** See `DomainEventMap['order.created']` above. */
export const ORDER_CREATED = 'order.created';
