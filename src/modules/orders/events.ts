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
         * customer cancelling is owed their money, an operator cancelling may not be. It is also
         * the only durable promise of that money: `payments` opens its refund record from this
         * event, and the relay retries the event until the record exists.
         */
        'order.cancelled': { orderId: string; refund: boolean };

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

        /**
         * An admin override moved the status forward by hand (`services/override.ts`), written to the
         * outbox in the override's own transaction beside its `order.status_changed`. `delivery`
         * listens so its fulfillment orders and shipments agree with the status: forward to `shipped`
         * ships every remainder, forward to `delivered` delivers them, both at `at`. A forced
         * shipment recorded through `delivery` is NOT this event: it never moves the order by override.
         *
         * Internal only — no AsyncAPI channel carries it.
         */
        'order.status_overridden': {
            orderId: string;
            from: OrderStatus;
            to: OrderStatus;
            /** ISO instant of the override — the instant `withdrawUntil` was counted from. */
            at: string;
            mode: 'status';
        };
    }
}

/** Exported so an emitter and its listeners share one spelling instead of duplicated literals. */
export const ORDER_CANCELLED = 'order.cancelled';

/** See `DomainEventMap['order.status_changed']` above. */
export const ORDER_STATUS_CHANGED = 'order.status_changed';

/** See `DomainEventMap['order.created']` above. */
export const ORDER_CREATED = 'order.created';

/** See `DomainEventMap['order.status_overridden']` above. */
export const ORDER_STATUS_OVERRIDDEN = 'order.status_overridden';
