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
 * Depends on `products` (reads and writes the two counter columns directly). A new product's
 * opening stock arrives the other way, as `PRODUCT_CREATED` — `products` cannot import this module
 * back, so it emits instead of calling in.
 *
 * See: docs/modules/inventory.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { PRODUCT_CREATED } from '@modules/products';
import { router } from './routes';
import { receive } from './service';
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
     * `products` cannot call this module back (it already imports `products`, and the graph must
     * stay acyclic — see `.dependency-cruiser.cjs`), so this is how a new product gets its opening
     * stock: through the real `receive()`, the same call every other receipt uses. No audit
     * context to pass — an admin already sees `ADMIN_PRODUCT_CREATED` for this row; a second,
     * contextless stock-received entry would just be noise on top of it.
     */
    subscribe: () => {
        onDomainEvent(PRODUCT_CREATED, ({ productId, onHand }) =>
            onHand > 0 ? receive(productId, onHand, 'Opening stock') : undefined
        );
    },
    /*
     * No entry in `scenarios/index.ts`: a hold only exists once someone has checked out, so a
     * seeded one would be a state the application cannot reach by seeding — see the note in
     * `scenarios/orders.ts`. A reservation is also never serialized to a client (see `./model`),
     * so there is nothing to export even if there were something to seed.
     */
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
