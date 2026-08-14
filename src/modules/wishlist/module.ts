import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { PRODUCT_DELETED } from '@modules/products';
import { USER_DELETED } from '@modules/users';
import { router } from './routes';
import { seedWishlistsCollection } from './seeds';
import { wishlistDeleteByUserId, productRemoveFromWishlistsById } from './service';

/**
 * The wishlist: one document per user, holding product references and nothing else.
 *
 * Depends on products because a saved line is meaningless without the product it points at, on
 * users because the list belongs to an account, and on cart because the move-to-cart exit writes
 * a cart line — the same one-way arrows the cart itself declares. Products and users reach back
 * the same way they reach the cart: a deleted product must leave every wishlist and a destroyed
 * account must take its wishlist with it, both arriving as domain events so the import graph
 * stays acyclic.
 */
export default {
    name: 'wishlist',
    basePath: '/wishlist',
    routes: router,
    dependsOn: ['cart', 'products', 'users'],
    subscribe: () => {
        onDomainEvent(PRODUCT_DELETED, ({ productId }) =>
            productRemoveFromWishlistsById(productId)
        );
        onDomainEvent(USER_DELETED, ({ userId }) => wishlistDeleteByUserId(userId));
    },
    seeds: seedWishlistsCollection,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
