/**
 * @module
 * Inventory: the two counters, the reservation lifecycle, and the ledger that explains both.
 *
 * Counters live on the product document (no join needed), but only this module writes them —
 * each transition is exactly-once via a conditionally claimed status, so a cancel racing the
 * sweep or a duplicate webhook still resolves to one winner.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      products
 * Reached by:   cart, orders, payments — all three ask for a transition by name and get a boolean
 * Not imports:  the counters are COLUMNS ON THE PRODUCT DOCUMENT. `products` declares them and this
 *               module is the only writer, and `20260817120000-inventory-counters.js` — a migration
 *               owned by this domain — is what put them on that collection. Nothing in the import
 *               graph shows that, which is why it is written here.
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
    routes: router,
    /*
     * No `seeds`: a hold only exists once someone has checked out, so a seeded one would be a
     * state the application cannot reach by seeding — see the note in `orders/demo.ts`. No
     * `seedExport` either, since a reservation is never serialized to a client (see `./model`).
     */
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
