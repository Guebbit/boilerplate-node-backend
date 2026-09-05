/**
 * @module
 * Delivery: shipping rates, shipments and the fake courier. Depends on orders because a shipment
 * is about an order, and on users only to address the shipped email in the recipient's language.
 * The rates live in `./domain` as pure functions so the cart's checkout can price a method without
 * this module's HTTP surface. Shipping is specific to how this shop operates but isn't what
 * anyone buys here — worth its own rules in `domain/`, not worth an aggregate.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      orders, users
 * Reached by:   cart (prices a method at checkout through `./domain`); account (the data export
 *               joins shipments onto the caller's own orders)
 *
 * See: docs/modules/delivery.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { ORDER_STATUS_CHANGED } from '@modules/orders';
import { router } from './routes';
import { shipOrder } from './service';

/** This module's manifest entry: routes, the `ORDER_STATUS_CHANGED` subscription, and its locales. */
export default {
    name: 'delivery',
    basePath: '/delivery',
    routes: router,
    subscribe: () => {
        onDomainEvent(ORDER_STATUS_CHANGED, ({ orderId, to }) => {
            if (to === 'shipped') return shipOrder(orderId);
            return undefined;
        });
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
