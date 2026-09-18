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
 * Declares its own queue consumer below, the same `ModuleConsumer` shape `webhooks` set the
 * precedent for (`@kernel/registry.ts`) — invoice PDF generation, triggered by this module's own
 * `order.created` listener. See `transport/invoice-pdf.ts` and `docs/modules/orders.md#the-invoice-pipeline`.
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { SYSTEM_ACTOR } from '@kernel/permissions';
import { onDomainEvent } from '@kernel/events';
import { RESERVATION_EXPIRED } from '@modules/inventory';
import { USER_DELETED } from '@modules/users';
import { WORKER_CHANNELS, OrderInvoicePdfJobPayloadSchema } from '@types';
import { router } from './routes';
import { cancelById, detachUserId, search, ownerScope } from './services';
import { enqueueInvoicePdfJob, handleInvoicePdfJob } from './transport/invoice-pdf';
// Also installs this module's other event declarations (ORDER_CANCELLED, ORDER_STATUS_CHANGED).
import { ORDER_CREATED } from './events';

/** Read past `search`'s own page-size default — a data-subject export answers "all of it". */
const EVERYTHING = 100_000;

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
                search({ pageSize: EVERYTHING }, ownerScope(subject.userId)).then(
                    (page) => page.items
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
        // Fires exactly once per order regardless of which creation path made it — see
        // `events.ts`'s own docblock on `order.created`. Returned, not `void`-wrapped:
        // `emitDomainEvent` already catches and logs per handler, and a publish failure here
        // leaves the order `pending` with nothing yet able to retry it (no dead-letter/parking
        // exists for any queue in this codebase today) — the same as every other queue's state.
        onDomainEvent(ORDER_CREATED, ({ orderId }) => enqueueInvoicePdfJob(orderId));
    },
    locales: path.join(__dirname, 'locales'),
    /*
     * `handler: handleInvoicePdfJob` directly, no separate guard in front of it: `schema` below
     * already refuses a job missing `orderId` before `consumeFromQueue` ever calls the handler,
     * same reasoning as webhooks' own consumer. `prefetch: 2` — CPU-bound (Puppeteer), like the
     * old domainless PDF queue this replaces, so kept low.
     */
    consumers: [
        {
            queue: WORKER_CHANNELS.ORDERS_INVOICE_GENERATE,
            handler: handleInvoicePdfJob,
            schema: OrderInvoicePdfJobPayloadSchema,
            prefetch: 2
        }
    ],
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
            // The three branches `current` (SECURITY_HOLES_7_STORAGE_QUOTA) can resolve to, plus
            // one order that buys all three products at once so a single response shows every
            // branch side by side — see `shop-history.ts`.
            'order.imageUnchanged',
            'order.imageReplaced',
            'order.productDeleted',
            'order.mixedImageStates'
        ]
    }
} satisfies AppModule;
