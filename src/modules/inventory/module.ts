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
 */
export default {
    name: 'inventory',
    /*
     * Supporting, and only just: getting it wrong oversells customers, but nobody chooses a shop
     * for its inventory system and every business that outgrows this buys a replacement. Worth
     * its own rules in `domain/`; not worth an aggregate.
     */
    subdomain: 'supporting',
    language: {
        'On hand': 'Units physically present, whether or not anyone has claimed them.',
        Reserved: 'Units an open order has claimed. Still on the shelf, no longer for sale.',
        Available:
            'On hand minus reserved — what a customer may buy. Derived everywhere, stored nowhere.',
        Reservation:
            'One order’s hold on its units, with a deadline. Ends as a commit, a release or an expiry — never by being deleted.',
        Transition:
            'One of the six ways a counter may move. Each implies a fixed pair of deltas (`domain/transitions.ts`) and each writes exactly one ledger row.',
        'Stock movement':
            'A ledger row: which product, which transition, and both signed deltas. Written by the same call that moved the counter, so it cannot be missing.',
        Sweep: 'The expiry tick. An operator is the cron, exactly as with the fake courier in `delivery`.'
    },
    basePath: '/inventory',
    routes: router,
    dependsOn: [
        {
            module: 'products',
            as: 'conformist',
            because:
                'Reads catalogue documents as they are and drives their two counters through the repository’s conditional primitives. The columns are the catalogue’s to declare; what they may become is this module’s to decide.'
        }
    ],
    /*
     * No `seeds`: a hold only exists once someone has checked out, so a seeded one would be a
     * state the application cannot reach by seeding — see the note in `orders/seeds.ts`. No
     * `seedExport` either, since a reservation is never serialized to a client (see `./model`).
     */
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
