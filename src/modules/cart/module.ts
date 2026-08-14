import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { router } from './routes';
import { seedCartsCollection } from './seeds';
import { PRODUCT_DELETED } from '@modules/products';
import { USER_DELETED } from '@modules/users';
import { cartDeleteByUserId, productRemoveFromCartsById } from './services';

/**
 * The shopping cart: one document per user, priced against the live catalogue.
 *
 * Depends on products because a cart line is meaningless without the product it points at, on users
 * because a checkout is priced against the account that owns it, and on orders because a checkout
 * is where a cart stops being a cart. Products and users also need to reach back — a deleted
 * product must leave every cart, a destroyed account must take its cart with it — and both of those
 * arrive as domain events, so the import graph stays acyclic even though the domains are mutually
 * aware. Orders never reaches back, so that edge is a plain import.
 */
export default {
    name: 'cart',
    basePath: '/cart',
    routes: router,
    dependsOn: ['account', 'delivery', 'orders', 'products', 'users'],
    subscribe: () => {
        onDomainEvent(PRODUCT_DELETED, ({ productId }) => productRemoveFromCartsById(productId));
        onDomainEvent(USER_DELETED, ({ userId }) => cartDeleteByUserId(userId));
    },
    seeds: seedCartsCollection,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
