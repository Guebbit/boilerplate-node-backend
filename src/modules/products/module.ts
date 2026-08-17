import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { seedProductsCollection, exportSeededProducts } from './seeds';
import './events';

/**
 * The product catalogue: public read, admin write, soft delete with restore.
 *
 * Depends on nothing. The cart needs products to price a line, and the products service needs the
 * cart emptied when an item disappears — the second half of that goes through `product.deleted`
 * precisely so this module stays a leaf.
 */
export default {
    name: 'products',
    /*
     * What a shop sells is the shop. Everything downstream — a cart line, an order item, a stock
     * movement — is a statement about a product, and the catalogue is the one model here that other
     * contexts conform to rather than translate.
     */
    subdomain: 'core',
    language: {
        Product: 'A sellable item in the catalogue. Identified by id; the name is not unique.',
        'On hand':
            'Units physically present. Stored here because this module owns the collection, but never written here — see `Counter`.',
        Reserved:
            'Units already claimed by an open order. Present on the shelf, not for sale. Stored here, written by `inventory`.',
        Available:
            'On hand minus reserved — what a customer may actually buy. Derived at serialization, never stored, so it cannot go stale.',
        Counter:
            'Either of the two stored numbers. This module declares them and reads them; every write goes through `inventory`, which owns the transitions and the ledger row that records each one.',
        'Soft delete':
            'Withdrawal from sale, reversible. The row survives so orders that embedded it stay readable.'
    },
    basePath: '/products',
    routes: router,
    seeds: seedProductsCollection,
    seedExport: exportSeededProducts,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
