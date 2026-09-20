/**
 * @module
 * Placed orders: admin write and soft delete, plus each account reading back its own. See
 * docs/theory/tactical-ddd.md for the invariants — totals, legal status transitions, what
 * cancelling restores. Depends on products (a line copies the catalogue row's fields at purchase
 * time, through `productService`, into this module's OWN `orderLineProductSchema` — not
 * `products`' `productSchema`, so the embedded copy has nowhere to carry a live warehouse counter)
 * and inventory (a claim on units, released on cancel or `RESERVATION_EXPIRED`); cart depends on
 * this module in turn, keeping the import graph acyclic. `users` is reached two ways: `USER_DELETED`
 * below, for the detach-on-delete cascade, and `userService.getById` (`services/crud.ts`,
 * `services/cancel.ts`) for a buyer's stored locale — the confirmation and expiry emails this
 * module sends, never a live account's authorization state.
 *
 * No queue consumer of its own: the invoice is rendered on demand, on whichever request thread
 * asks for it — see `services/invoice.ts`.
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { SYSTEM_ACTOR } from '@kernel/permissions';
import { onDomainEvent } from '@kernel/events';
import { RESERVATION_EXPIRED } from '@modules/inventory';
import { USER_DELETED } from '@modules/users';
import { PRODUCT_DELETED, PRODUCT_DEACTIVATED } from '@modules/products';
import { readAll, MAX_CONFIGURED_PAGE_SIZE } from '@infrastructure/persistence/search';
import { router } from './routes';
import {
    cancelById,
    cancelPendingOrdersHolding,
    detachUserId,
    search,
    ownerScope
} from './services';
import { ordersRateLimits } from './rate-limits';
// Side-effect only: registers this module's event declarations (ORDER_CANCELLED, ORDER_CREATED,
// ORDER_STATUS_CHANGED) into the kernel's `DomainEventMap`. Nothing here listens to its own
// `order.created` any more — `webhooks` is the only outside listener left.
import './events';

/** This module's manifest entry: routes, the shop-identity config gate, event subscriptions, and locales. */
export default {
    name: 'orders',
    basePath: '/orders',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: [
        'orders.self.read',
        'orders.any.read',
        'orders.any.create',
        'orders.any.update',
        'orders.any.delete',
        'orders.any.override'
    ],
    routes: router,
    // The invoice prints the shop's own jurisdiction, and an invoice with no country on it is not
    // one. The other two identity fields (`./config`) are genuinely optional, so neither is here.
    requiredConfig: [{ key: 'NODE_SHOP_COUNTRY', minLength: 1 }],
    personalData: [
        {
            section: 'orders',
            collect: (subject) =>
                readAll(
                    (page) =>
                        search(
                            { page, pageSize: MAX_CONFIGURED_PAGE_SIZE },
                            ownerScope(subject.userId)
                        ).then((result) => result.items),
                    MAX_CONFIGURED_PAGE_SIZE
                )
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
        onDomainEvent(RESERVATION_EXPIRED, ({ orderId }) => cancelById(orderId, SYSTEM_ACTOR));
        // Detach, never delete: the order survives the account.
        onDomainEvent(USER_DELETED, ({ userId }) => detachUserId(userId));
        // Only the HARD half of a product's removal — a soft delete (or its restore) leaves a
        // pending order's line exactly as it was, the same reasoning `inventory`'s own listener
        // follows for the level row. Deactivation is unconditional: `product.deactivated` never
        // fires for anything but the true→false flip.
        onDomainEvent(PRODUCT_DELETED, ({ productId, hardDelete }) =>
            hardDelete ? cancelPendingOrdersHolding(productId) : undefined
        );
        onDomainEvent(PRODUCT_DEACTIVATED, ({ productId }) =>
            cancelPendingOrdersHolding(productId)
        );
    },
    locales: path.join(__dirname, 'locales'),
    // See `./rate-limits.ts` — every invoice render spawns a Chromium launch.
    rateLimits: ordersRateLimits,
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
            'order.ownerPending',
            'order.paid',
            'order.shipped',
            'order.delivered',
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
