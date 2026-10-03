/**
 * @module
 * Placed orders: admin write and soft delete, plus each account reading back its own. See
 * docs/theory/tactical-ddd.md for the invariants — totals, legal status transitions, what
 * cancelling restores. Depends on products (a line copies the catalogue row's fields at purchase
 * time, through `productService`, into this module's OWN `orderLineProductSchema` — not
 * `products`' `productSchema`, so the embedded copy has nowhere to carry a live warehouse counter)
 * and inventory (a claim on units, released on cancel or `RESERVATION_EXPIRED`); cart depends on
 * this module in turn, keeping the import graph acyclic. `users` is reached two ways: the
 * `personalData.erase` hook below, for the detach-on-delete cascade, and `userService.getById`
 * (`services/crud.ts`, `services/cancel.ts`) for a buyer's stored locale — the confirmation and
 * expiry emails this module sends, never a live account's authorization state.
 *
 * No queue consumer of its own. `invoicing` depends on this module (for the VAT breakdown and an
 * auth-scoped order read) and reacts to `ORDER_STATUS_CHANGED` on its own — this module has no
 * import of, or wiring for, `invoicing` at all. See `docs/modules/invoicing.md`.
 */

import path from 'node:path';
import type { AppModule, PublicEventTarget } from '@kernel/registry';
import { SYSTEM_ACTOR } from '@kernel/permissions';
import { onDomainEvent, type DomainEventMap } from '@kernel/events';
import { RESERVATION_EXPIRED } from '@modules/inventory';
import { PRODUCT_DELETED } from '@modules/products';
import { router } from './routes';
import { cancelById, cancelPendingOrdersHolding, eraseUserOrders, findOwnOrders } from './services';
// Also registers this module's event declarations (ORDER_CANCELLED, ORDER_CREATED,
// ORDER_STATUS_CHANGED) into the kernel's `DomainEventMap`. Reached directly, never through this
// module's own barrel — see CLAUDE.md's module-barrel rule.
import { ORDER_CANCELLED, ORDER_CREATED, ORDER_STATUS_CHANGED } from './events';
import { ordersConfig } from './config';

/**
 * This module's public (webhook-visible) events — `webhooks/services/publish.ts`
 * subscribes to these generically, through `kernel/registry.ts`'s `resolvePublicEvents`, instead
 * of importing `ORDER_CREATED` and siblings by name.
 *
 * `order.status_changed` is the one that ISN'T a straight rename: it derives two different public
 * names, `order.paid`/`order.shipped`, filtered on `to` — "listeners filter on `to`; the event
 * doesn't know who cares" — and produces neither for any other transition.
 */
const publicEvents: Readonly<Record<string, PublicEventTarget>> = {
    [ORDER_CREATED]: {
        toPublicEvent: (payload: DomainEventMap[typeof ORDER_CREATED]) => ({
            eventType: 'order.created',
            data: { orderId: payload.orderId }
        })
    },
    [ORDER_STATUS_CHANGED]: {
        toPublicEvent: (payload: DomainEventMap[typeof ORDER_STATUS_CHANGED]) => {
            if (payload.to === 'paid')
                return { eventType: 'order.paid', data: { orderId: payload.orderId } };
            if (payload.to === 'shipped')
                return { eventType: 'order.shipped', data: { orderId: payload.orderId } };
            return undefined;
        }
    },
    [ORDER_CANCELLED]: {
        toPublicEvent: (payload: DomainEventMap[typeof ORDER_CANCELLED]) => ({
            eventType: 'order.cancelled',
            data: { orderId: payload.orderId, refund: payload.refund }
        })
    }
};

/** This module's manifest entry: routes, the shop-identity config gate, event subscriptions, and locales. */
export default {
    name: 'orders',
    basePath: '/orders',
    routes: router,
    publicEvents,
    // Jurisdiction, currency, bank transfer and the order link: see `./config`.
    config: [ordersConfig.slice],
    personalData: [
        {
            section: 'orders',
            collect: (subject) => findOwnOrders(subject.userId),
            // Detach, never delete — the order survives the account, inside the same
            // hard-delete transaction. A never-paid order is also cancelled, after the commit.
            // See `eraseUserOrders`.
            erase: eraseUserOrders
        }
    ],
    /*
     * A hold that timed out takes its order with it — the units are already released by the
     * time this fires; what `inventory` cannot do is cancel an order without importing this
     * module. The SHOP is cancelling, not the customer, so the sweep acts as `SYSTEM_ACTOR`:
     * `cancelById` calls
     * back into `releaseForOrder`, which finds the hold already released, so the two paths
     * converge and neither can double-release.
     */
    subscribe: () => {
        onDomainEvent(RESERVATION_EXPIRED, ({ orderId }) =>
            cancelById(orderId, SYSTEM_ACTOR, {}, undefined, true)
        );
        // Only the HARD half of a product's removal — a soft delete (or its restore), and a
        // deactivation, both leave a pending order's line exactly as it was: the order was placed
        // while the product was sellable, and the buyer's money (or its 7-day bank-transfer
        // promise) should not evaporate because the catalogue changed its mind. `unavailableLines`
        // still refuses anything NEW against a deactivated product — checkout, and a card payment
        // on an existing order — an offline payment stays allowed, an operator's own call.
        onDomainEvent(PRODUCT_DELETED, ({ productId, hardDelete }) =>
            hardDelete ? cancelPendingOrdersHolding(productId) : undefined
        );
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates'),
    /**
     * The order states the storefront and the admin both have a screen for.
     *
     * Every one is PRODUCED, not seeded — `scenarios/flows/shop-history.ts` reaches each by
     * driving the endpoints a person would, so the ids are minted at boot and served by
     * `GET /__test/scenario`. `tests/integration/scenarios/shop.test.ts` holds this list equal to
     * what the runner actually recorded, in both directions.
     */
    scenario: {
        shop: [
            'order.otherPending',
            'order.paid',
            'order.paidExpress',
            'order.shipped',
            'order.delivered',
            // One delivered order per withdrawal state, aged from the period: open (1 day back),
            // last day (exactly `period` days back, closes at the end of today UTC), closed.
            'order.withdrawal-open',
            'order.withdrawal-last-day',
            'order.withdrawal-closed',
            // Delivered today, so the withdrawal window is still open; `order.delivered` is weeks past it.
            'order.deliveredRecent',
            // Delivered at the start of the shop's history, so its withdrawal window is long closed.
            'order.deliveredLongAgo',
            'order.cancelled',
            'order.softDeleted',
            'order.paidOffline',
            'order.awaitingTransfer',
            // The three branches `./services/current.ts` can resolve a picture to, plus one order
            // that buys all three products at once so a single response shows every branch side
            // by side — see `shop-history.ts`.
            'order.imageUnchanged',
            'order.imageReplaced',
            'order.productDeleted',
            'order.mixedImageStates'
        ]
    }
} satisfies AppModule;
