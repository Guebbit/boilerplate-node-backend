/**
 * @module
 * Delivery: shipping rates, shipments and the fake courier. Depends on orders because a shipment
 * is about an order, and on users only to address the shipped email in the recipient's language.
 * The rates live in `./domain` as pure functions so the cart's checkout can price a method without
 * this module's HTTP surface. Shipping is specific to how this shop operates but isn't what
 * anyone buys here — worth its own rules in `domain/`, not worth an aggregate.
 *
 * See: docs/modules/delivery.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { ORDER_STATUS_CHANGED, search, ownerScope } from '@modules/orders';
import { router } from './routes';
import { shipOrder, findShipmentsForOrders } from './service';

/** Read past `search`'s own page-size default — a data-subject export answers "all of it". */
const EVERYTHING = 100_000;

/** This module's manifest entry: routes, the `ORDER_STATUS_CHANGED` subscription, and its locales. */
export default {
    name: 'delivery',
    basePath: '/delivery',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: ['delivery.any.read', 'delivery.any.update'],
    routes: router,
    personalData: [
        {
            section: 'shipments',
            // `delivery -> orders` already exists (see the module docblock); the shipment read
            // itself needs the caller's own order ids first, the same `.search()` normalization
            // trap `orders/module.ts`'s own export section navigates — `.search()` turns `_id`
            // into `id` on the way out, so `._id` reads as `undefined` despite the type's claim.
            collect: (subject) =>
                search({ pageSize: EVERYTHING }, ownerScope(subject.userId)).then((page) =>
                    findShipmentsForOrders(
                        page.items.map((order) =>
                            String((order as typeof order & { id?: string }).id ?? order._id)
                        )
                    )
                )
        }
    ],
    subscribe: () => {
        onDomainEvent(ORDER_STATUS_CHANGED, ({ orderId, to }) => {
            if (to === 'shipped') return shipOrder(orderId);
            return undefined;
        });
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
