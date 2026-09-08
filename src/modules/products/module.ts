/**
 * @module
 * The product catalogue: public read, admin write, soft delete with restore. Depends on nothing —
 * a leaf module, and everything downstream (cart, orders, stock) is a statement about a product,
 * which is what makes this the one model other contexts conform to. It stays a leaf by emitting
 * `product.deleted` rather than importing the cart directly.
 *
 * Not in the import graph: `onHand` and `reserved` are declared on this document and written ONLY
 *   by `inventory`. This module never moves them. See that module's docblock.
 *
 * See: docs/modules/products.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { productRepository } from './repository';
import './events';

/** This module's manifest entry: routes, locales, and the inventory image target. */
export default {
    name: 'products',
    basePath: '/products',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: [
        'products.read',
        'products.create',
        'products.update',
        'products.delete',
        'products.manage'
    ],
    routes: router,
    locales: path.join(__dirname, 'locales'),
    imageTargets: { products: { writeback: productRepository.writebackImage } }
} satisfies AppModule;
