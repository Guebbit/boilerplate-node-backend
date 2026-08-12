import path from 'node:path';
import type { IAppModule } from '@kernel/registry';
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
    basePath: '/products',
    routes: router,
    seeds: seedProductsCollection,
    locales: path.join(__dirname, 'locales')
} satisfies IAppModule;
