import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { seedProductsCollection } from './seeds';
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
        Stock: 'Units on the shelf. Authoritative here — every other module reads it, none computes it.',
        'Soft delete':
            'Withdrawal from sale, reversible. The row survives so orders that embedded it stay readable.',
        'Stock movement':
            'An announcement that units moved, and by how much. The reason is `inventory`’s to record, not this module’s.'
    },
    basePath: '/products',
    routes: router,
    seeds: seedProductsCollection,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
