/**
 * @module
 * The wishlist: one document per user, holding product references and nothing else.
 *
 * Depends on products because a saved line is meaningless without the product it points at, on
 * users because the list belongs to an account, and on cart because the move-to-cart exit writes
 * a cart line — the same one-way arrows the cart itself declares. Products and users reach back
 * the same way they reach the cart: a deleted product must leave every wishlist and a destroyed
 * account must take its wishlist with it, both arriving as domain events so the import graph
 * stays acyclic.
 *
 * A saved list with one exit into the cart. It holds no rules worth modelling — deleting it costs the
 * shop a convenience, not a capability.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      cart, products, users
 * Reached by:   nothing
 *
 * See: docs/modules/wishlist.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { PRODUCT_DELETED } from '@modules/products';
import { USER_DELETED } from '@modules/users';
import { router } from './routes';
import { seedWishlistsCollection, exportSeededWishlists } from './demo';
import { wishlistDeleteByUserId, productRemoveFromWishlistsById } from './service';

/** This module's manifest entry: routes, event subscriptions, demo seeding, and locales. */
export default {
    name: 'wishlist',
    basePath: '/wishlist',
    routes: router,
    subscribe: () => {
        onDomainEvent(PRODUCT_DELETED, ({ productId }) =>
            productRemoveFromWishlistsById(productId)
        );
        onDomainEvent(USER_DELETED, ({ userId }) => wishlistDeleteByUserId(userId));
    },
    seeds: seedWishlistsCollection,
    seedExport: exportSeededWishlists,
    /* `GET /wishlist` answers the caller's own list, resolved against the catalogue. */
    demoShapes: { wishlists: 'stored' },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
