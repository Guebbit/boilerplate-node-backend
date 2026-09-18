/**
 * @module
 * The shopping cart: one document per user, priced against the live catalogue. Depends on
 * products, users and orders — a checkout is where a cart stops being a cart — plus delivery and
 * payments, to price shipping and to validate/size the chosen payment method against what the
 * deployment actually offers. Products and users reach back via domain events instead, keeping
 * the import graph acyclic.
 *
 * See: docs/modules/cart.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { router } from './routes';
import { PRODUCT_DELETED } from '@modules/products';
import { USER_DELETED } from '@modules/users';
import { cartDeleteByUserId, productRemoveFromCartsById, cartGet } from './services';

/** This module's manifest entry: routes, event subscriptions, and locales. */
export default {
    name: 'cart',
    basePath: '/cart',
    /**
     * The one permission key this module introduces — see `shared/authorization-keys.yaml`'s own
     * comment on `cart.self.checkout` for why the basket's contents stay keyless while spending it
     * doesn't. `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: ['cart.self.checkout'],
    routes: router,
    personalData: [
        {
            section: 'cart',
            // Stripped to the stored line, not the joined product: the product's own name/price
            // is catalogue data, not the caller's, and the shared `CartItem` contract this maps
            // onto is `additionalProperties: false`.
            collect: (subject) =>
                cartGet(subject.userId).then((lines) =>
                    lines.map(({ productId, quantity }) => ({ productId, quantity }))
                )
        }
    ],
    subscribe: () => {
        onDomainEvent(PRODUCT_DELETED, ({ productId }) => productRemoveFromCartsById(productId));
        onDomainEvent(USER_DELETED, ({ userId }) => cartDeleteByUserId(userId));
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
