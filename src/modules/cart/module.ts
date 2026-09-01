/**
 * @module
 * The shopping cart: one document per user, priced against the live catalogue. Depends on
 * products, users and orders — a checkout is where a cart stops being a cart; products and users
 * reach back via domain events instead, keeping the import graph acyclic.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      account, delivery, inventory, orders, products, users
 * Reached by:   wishlist (the move-to-cart exit); account (the data export reads the caller's
 *               own cart)
 * Not imports:  `20260808160000-cart-collection.js` creates this module's collection and reads
 *               `users` to do it.
 *
 * See: docs/modules/cart.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { router } from './routes';
import { seedCartsCollection, exportSeededCarts } from './demo';
import { PRODUCT_DELETED } from '@modules/products';
import { USER_DELETED } from '@modules/users';
import { cartDeleteByUserId, productRemoveFromCartsById } from './services';

/** This module's manifest entry: routes, event subscriptions, demo seeding, and locales. */
export default {
    name: 'cart',
    basePath: '/cart',
    routes: router,
    subscribe: () => {
        onDomainEvent(PRODUCT_DELETED, ({ productId }) => productRemoveFromCartsById(productId));
        onDomainEvent(USER_DELETED, ({ userId }) => cartDeleteByUserId(userId));
    },
    seeds: seedCartsCollection,
    seedExport: exportSeededCarts,
    /* `GET /cart` answers the caller's own cart with its lines resolved against the catalogue,
     * so the stored row is the input to that response rather than the response. */
    demoShapes: { carts: 'stored' },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
