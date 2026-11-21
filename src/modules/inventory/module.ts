/**
 * @module
 * Inventory: the stock counters, the reservation lifecycle, and the ledger that explains both.
 * Counters live in this module's own `stocklevels` collection — each transition is exactly-once
 * via a conditionally claimed status, so a cancel racing the sweep or a duplicate webhook still
 * resolves to one winner.
 *
 * Depends on `products` for a title in a shortfall message, and to mirror every counter change
 * onto its document so a catalogue read still needs no join — see
 * `docs/modules/inventory.md#why-products-still-carries-a-copy`. A new product's opening stock
 * arrives the other way, as `PRODUCT_CREATED` — `products` cannot import this module back, so it
 * emits instead of calling in.
 *
 * @see docs/modules/inventory.md#its-neighbourhood
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { PRODUCT_CREATED, PRODUCT_DELETED, PRODUCT_TERMS_CHANGED } from '@modules/products';
import { router } from './routes';
import { availabilityRouter } from './availability-routes';
import { openLevel, removeLevel } from './services/levels';
import { forgetAvailability } from './services/availability';
// Registers the two domain gauges with the metrics registry at module load.
import './metrics';
import { inventoryConfig } from './config';
import { inventoryJobs } from './jobs';
import { PREORDER_ALLOCATED, STOCK_RETAKEN } from './events';
import { refreshStockCacheForProducts } from './services/transition';

/** This module's manifest entry: routes, the two domain gauges, and locales. */
export default {
    name: 'inventory',
    /**
     * `/inventory` first: `security.ts` reads the first mount's base path for `rawBodyPaths`. The
     * second is the availability reads, under the catalogue's URL; why it sits ahead of `products`
     * is in `./availability-routes.ts`.
     */
    mounts: [
        { basePath: '/inventory', routes: router },
        { basePath: '/products', routes: availabilityRouter }
    ],
    jobs: inventoryJobs,
    config: [inventoryConfig.slice],
    /**
     * `products` cannot call this module back (it already imports `products`, and the graph must
     * stay acyclic — see `.dependency-cruiser.cjs`), so this is how a new product gets its stock
     * level. `openLevel` creates the row at zero — a zero-stock product must still be visible to the
     * stock board and the low-stock gauge — and the outbox's redelivery finds it. No unit is booked:
     * stock enters only through `receive`. No audit context: an admin already sees
     * `ADMIN_PRODUCT_CREATED` for this row.
     */
    subscribe: () => {
        onDomainEvent(PRODUCT_CREATED, ({ productId }) => openLevel(productId));
        /**
         * Only the HARD half — a soft delete (or its restore) must leave the counters exactly
         * where a restore has to come back to them. See `removeLevel`'s own docblock.
         */
        onDomainEvent(PRODUCT_DELETED, ({ productId, hardDelete }) =>
            // The level row goes only on a hard delete; the cached answer goes either way.
            (hardDelete ? removeLevel(productId) : Promise.resolve()).then(() =>
                forgetAvailability([productId])
            )
        );
        /**
         * An edit to what decides availability (sale flags, backorder switch, dates), or a restore.
         * No stock moved, so the funnel never ran; this is the other way an entry goes stale.
         */
        onDomainEvent(PRODUCT_TERMS_CHANGED, ({ productId }) => forgetAvailability([productId]));
        /**
         * This module's own announcement: a payment that serves a preorder moves counters inside the
         * payer's transaction, where the catalogue copy cannot be written (it would not roll back).
         * The cache's owner brings it into step once the commit has landed. A plain commit moves no
         * counter, so it announces nothing and needs no refresh. Eventual is fine: the copy may
         * already be stale, see `docs/modules/inventory.md#why-products-still-carries-a-copy`.
         */
        onDomainEvent(PREORDER_ALLOCATED, ({ productId }) =>
            refreshStockCacheForProducts([productId])
        );
        // Same reason for a late payment that took a released hold's units again.
        onDomainEvent(STOCK_RETAKEN, ({ productIds }) => refreshStockCacheForProducts(productIds));
    },
    /**
     * No entry in `scenarios/index.ts`: a hold only exists once someone has checked out, so a
     * seeded one would be a state the application cannot reach by seeding — see the note in
     * `scenarios/flows/shop-history.ts`. A reservation is also never serialized to a client
     * (see `./model`), so there is nothing to export even if there were something to seed.
     */
    locales: path.join(__dirname, 'locales'),
    /**
     * Stock movements and holds are keyed by product and order, never by person — see the
     * `scenarios` comment above on why a reservation is never even serialized to a client.
     */
    personalData: 'none'
} satisfies AppModule;
