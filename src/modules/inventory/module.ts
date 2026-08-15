import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { STOCK_MOVED } from '@modules/products';
import { router } from './routes';
import { recordMovement } from './service';
// Registers the low-stock gauge with the metrics registry at module load.
import './metrics';

/**
 * Inventory: the stock-movements ledger and the restock, downstream of everyone who moves units.
 *
 * Depends only on products, whose shelf counts stay authoritative — the ledger explains changes,
 * it never computes them. Every mover (checkout, cancel, the admin form, the restock here)
 * announces through `STOCK_MOVED` and this module writes the row; deleting this module leaves
 * every count correct and every WHY unrecorded, which is exactly the boilerplate's pre-ledger
 * state.
 */
export default {
    name: 'inventory',
    /*
     * A ledger that explains stock without owning it. Specific to running a shop, not the reason
     * anyone shops here — and deliberately kept downstream, so it can never become a second
     * authority on how many units exist.
     */
    subdomain: 'supporting',
    language: {
        'Stock movement':
            'One row explaining a change in stock: how many, and why. Written after the fact, never as the cause.',
        Reason: 'What moved the units — a sale, a cancellation, an admin edit, a restock. The whole value of the ledger.',
        Restock:
            'The one movement this module originates rather than records. It still announces through `products`.'
    },
    basePath: '/inventory',
    routes: router,
    dependsOn: [
        {
            module: 'products',
            as: 'conformist',
            because:
                'Reads the catalogue’s own counts and listens to `stock.moved`; the shelf number stays the catalogue’s to define.'
        }
    ],
    subscribe: () => {
        onDomainEvent(STOCK_MOVED, (movement) => recordMovement(movement));
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
