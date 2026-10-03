/**
 * @module
 * The shopping cart: one document per user, priced against the live catalogue. Depends on
 * products, users and orders — a checkout is where a cart stops being a cart — plus delivery and
 * payments, to price shipping and to validate/size the chosen payment method against what the
 * deployment actually offers, and addresses, to resolve the ship-to address a checkout freezes
 * onto the order. Products reaches back via a domain event; users reaches back
 * through this module's own `personalData.erase` hook below — neither an import, keeping the
 * import graph acyclic.
 *
 * See: docs/modules/cart.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { router } from './routes';
import { PRODUCT_DELETED } from '@modules/products';
import { cartDeleteByUserId, productRemoveFromCartsById, cartGet } from './services';
import { cartConfig } from './config';

/** This module's manifest entry: routes, event subscriptions, and locales. */
export default {
    name: 'cart',
    basePath: '/cart',
    routes: router,
    config: [cartConfig.slice],
    personalData: [
        {
            section: 'cart',
            // Stripped to the stored line, not the joined product: the product's own name/price
            // is catalogue data, not the caller's, and the shared `CartItem` contract this maps
            // onto is `additionalProperties: false`.
            collect: (subject) =>
                cartGet(subject.userId).then((lines) =>
                    lines.map(({ productId, quantity }) => ({ productId, quantity }))
                ),
            // Joins the caller's own hard-delete transaction — see `cartDeleteByUserId`.
            erase: cartDeleteByUserId
        }
    ],
    subscribe: () => {
        onDomainEvent(PRODUCT_DELETED, ({ productId }) => productRemoveFromCartsById(productId));
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
