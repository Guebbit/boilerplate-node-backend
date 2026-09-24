/**
 * @module
 * Delivery: shipping rates and shipments. Depends on orders because a shipment is about an order,
 * and on users only to address the shipped email in the recipient's language. The rates live in
 * `./domain` as pure functions so the cart's checkout can price a method without this module's
 * HTTP surface. Shipping is specific to how this shop operates but isn't what anyone buys here —
 * worth its own rules in `domain/`, not worth an aggregate.
 *
 * See: docs/modules/delivery.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { ownOrderIds } from '@modules/orders';
import { router } from './routes';
import { findShipmentsForOrders } from './service';

/** This module's manifest entry: routes, the export section, and its locales. */
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
            // itself needs the caller's own order ids first — `orders` publishes `ownOrderIds`
            // for exactly this, so this module never has to page through full order documents
            // (or navigate `.search()`'s own `_id`/`id` normalization trap) just to get them.
            collect: (subject) =>
                ownOrderIds(subject.userId).then((orderIds) => findShipmentsForOrders(orderIds))
        }
    ],
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
