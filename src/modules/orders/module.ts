/**
 * @module
 * Placed orders: admin write and soft delete, plus each account reading back its own. See
 * `TACTICAL_DDD_PLAN.md` §5 for the invariants — totals, legal status transitions, what
 * cancelling restores. Depends on products (an order embeds the catalogue row at purchase time)
 * and inventory (a claim on units, released on cancel or `RESERVATION_EXPIRED`); cart depends on
 * this module in turn, keeping the import graph acyclic.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      inventory, products, users
 * Reached by:   cart, delivery, payments, account (the data export reads the caller's own orders)
 * Not imports:  an order EMBEDS `productSchema` rather than referencing it, so a change to the
 *               catalogue's shape is a change to this collection's stored history. `users` is
 *               reached for exactly one thing — `USER_DELETED` below — not for resolving a live
 *               account, which stays `delivery`'s and `payments`' job.
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { RESERVATION_EXPIRED } from '@modules/inventory';
import { USER_DELETED } from '@modules/users';
import { router } from './routes';
import { seedOrdersCollection, exportSeededOrders } from './demo';
import { cancelById, detachUserId } from './service';
// Installs this module's event declarations (ORDER_CANCELLED, ORDER_STATUS_CHANGED).
import './events';

/** This module's manifest entry: routes, event subscriptions, demo seeding, and locales. */
export default {
    name: 'orders',
    basePath: '/orders',
    routes: router,
    /*
     * A hold that timed out takes its order with it — the units are already released by the
     * time this fires; what `inventory` cannot do is cancel an order without importing this
     * module. Admin scope because the shop is cancelling, not the customer: `cancelById` calls
     * back into `releaseForOrder`, which finds the hold already released, so the two paths
     * converge and neither can double-release.
     */
    subscribe: () => {
        onDomainEvent(RESERVATION_EXPIRED, ({ orderId }) => cancelById(orderId, { admin: true }));
        // Detach, never delete: the order survives the account.
        onDomainEvent(USER_DELETED, ({ userId }) => detachUserId(userId));
    },
    seeds: seedOrdersCollection,
    seedExport: exportSeededOrders,
    /* `GET /orders/:id` answers the serialized document as it stands, totals included. */
    demoShapes: { orders: 'response' },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
