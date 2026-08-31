/**
 * @module
 * The product catalogue: public read, admin write, soft delete with restore. Depends on nothing —
 * a leaf module, and everything downstream (cart, orders, stock) is a statement about a product,
 * which is what makes this the one model other contexts conform to. It stays a leaf by emitting
 * `product.deleted` rather than importing the cart directly.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      nothing
 * Reached by:   cart, inventory, orders, wishlist — the most-depended-on module here
 * Not imports:  `onHand` and `reserved` are declared on this document and written ONLY by
 *               `inventory`. This module never moves them. See that module's docblock.
 *
 * See: docs/modules/products.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { seedProductsCollection, exportSeededProducts } from './demo';
import { productRepository } from './repository';
import './events';

/** This module's manifest entry: routes, demo seeding, locales, and the inventory image target. */
export default {
    name: 'products',
    basePath: '/products',
    routes: router,
    seeds: seedProductsCollection,
    seedExport: exportSeededProducts,
    /* `GET /products/:id` answers the serialized document as it stands. */
    demoShapes: { products: 'response' },
    locales: path.join(__dirname, 'locales'),
    imageTargets: { products: { writeback: productRepository.writebackImage } }
} satisfies AppModule;
