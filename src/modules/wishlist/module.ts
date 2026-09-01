/**
 * @module
 * The wishlist: one document per user, holding product references and nothing else. Depends on
 * products (a saved line is meaningless without one), users (the list belongs to an account), and
 * cart (move-to-cart writes a line). Products and users reach back the same way they reach the
 * cart — a deleted product or account cleans up via domain events, keeping the import graph
 * acyclic. No rules worth modelling here: deleting it costs a convenience, not a capability.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      cart, products, users
 * Reached by:   account (the data export reads the caller's own wishlist)
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
