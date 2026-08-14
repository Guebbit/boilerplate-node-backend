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
    basePath: '/inventory',
    routes: router,
    dependsOn: ['products'],
    subscribe: () => {
        onDomainEvent(STOCK_MOVED, (movement) => recordMovement(movement));
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
