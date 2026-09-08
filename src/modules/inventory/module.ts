/**
 * @module
 * Inventory: the two counters, the reservation lifecycle, and the ledger that explains both.
 * Counters live on the product document (no join needed), but only this module writes them —
 * each transition is exactly-once via a conditionally claimed status, so a cancel racing the
 * sweep or a duplicate webhook still resolves to one winner.
 *
 * Not in the import graph: the counters are COLUMNS ON THE PRODUCT DOCUMENT. `products` declares
 *   them and this module is the only writer. Nothing in the import graph shows that, which is why
 *   it is written here.
 *
 * See: docs/modules/inventory.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import './events';
// Registers the two domain gauges with the metrics registry at module load.
import './metrics';

/** This module's manifest entry: routes, the two domain gauges, and locales. */
export default {
    name: 'inventory',
    basePath: '/inventory',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: ['inventory.read', 'inventory.create', 'inventory.manage'],
    routes: router,
    /*
     * No `seeds`: a hold only exists once someone has checked out, so a seeded one would be a
     * state the application cannot reach by seeding — see the note in `orders/demo.ts`. No
     * `seedExport` either, since a reservation is never serialized to a client (see `./model`).
     */
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
