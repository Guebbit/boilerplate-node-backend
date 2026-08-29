import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import './events';
// Registers the two domain gauges with the metrics registry at module load.
import './metrics';

/**
 * Inventory: the two counters, the reservation lifecycle, and the ledger that explains both.
 *
 * The counters live on the product document so a catalogue read needs no join, but `products`
 * never writes them and neither does anyone else — every change goes through a transition here.
 *
 *   checkout / admin order create  →  reserveForOrder    units held, not sold
 *   payment confirmed              →  commitForOrder     units leave
 *   order cancelled                →  releaseForOrder    units come back
 *   the sweep                      →  releaseForOrder    the hold timed out, units come back
 *
 * Each is exactly-once: the hold's status is claimed conditionally, so a cancel racing the sweep
 * or a webhook delivered twice resolves to one winner. Deleting this module leaves a shop that
 * cannot sell, which is the honest consequence of owning something.
 *
 * Getting this wrong oversells customers, so it is worth its own rules in `domain/`. Nobody chooses
 * a shop for its inventory system, though, and a business that outgrows this buys a replacement —
 * so rules yes, aggregate no.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      products
 * Reached by:   cart, orders, payments — all three ask for a transition by name and get a boolean
 * Not imports:  the counters are COLUMNS ON THE PRODUCT DOCUMENT. `products` declares them and this
 *               module is the only writer, and `20260817120000-inventory-counters.js` — a migration
 *               owned by this domain — is what put them on that collection. Nothing in the import
 *               graph shows that, which is why it is written here.
 */
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
