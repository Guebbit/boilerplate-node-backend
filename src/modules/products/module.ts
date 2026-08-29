import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { seedProductsCollection, exportSeededProducts } from './demo';
import './events';

/**
 * The product catalogue: public read, admin write, soft delete with restore.
 *
 * Depends on nothing. The cart needs products to price a line, and the products service needs the
 * cart emptied when an item disappears — the second half of that goes through `product.deleted`
 * precisely so this module stays a leaf.
 *
 * What a shop sells is the shop. Everything downstream — a cart line, an order item, a stock movement
 * — is a statement about a product, which makes this the one model other contexts conform to rather
 * than translate. It is also why it is a leaf: it must not know who is conforming to it.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      nothing
 * Reached by:   cart, inventory, orders, wishlist — the most-depended-on module here
 * Not imports:  `onHand` and `reserved` are declared on this document and written ONLY by
 *               `inventory`. This module never moves them. See that module's docblock.
 */
export default {
    name: 'products',
    basePath: '/products',
    routes: router,
    seeds: seedProductsCollection,
    seedExport: exportSeededProducts,
    /* `GET /products/:id` answers the serialized document as it stands. */
    demoShapes: { products: 'response' },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
