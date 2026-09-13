/**
 * @module
 * The shopping cart: one document per user, priced against the live catalogue. Depends on
 * products, users and orders — a checkout is where a cart stops being a cart; products and users
 * reach back via domain events instead, keeping the import graph acyclic.
 *
 * See: docs/modules/cart.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { router } from './routes';
import { PRODUCT_DELETED } from '@modules/products';
import { USER_DELETED } from '@modules/users';
import { cartDeleteByUserId, productRemoveFromCartsById } from './services';

/** This module's manifest entry: routes, event subscriptions, and locales. */
export default {
    name: 'cart',
    basePath: '/cart',
    routes: router,
    subscribe: () => {
        onDomainEvent(PRODUCT_DELETED, ({ productId }) => productRemoveFromCartsById(productId));
        onDomainEvent(USER_DELETED, ({ userId }) => cartDeleteByUserId(userId));
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
