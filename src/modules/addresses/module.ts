/**
 * @module
 * The address book — one document per user, the shipping addresses a checkout resolves against.
 * Its own module so nothing has to import `account` for it: `cart`'s checkout is the only sibling
 * consumer, and `users` reaches it only through its `personalData.erase` hook below, never an
 * import — the same pattern `cart`, `wishlist`, `payments` and `orders` each declare on their own
 * collection.
 *
 * Owns:   the address book, outright.
 * Shares: the `/account` URL prefix with `account` — see `./routes.ts` and `getAuth`'s early
 *         return (`kernel/middlewares/authorizations.ts`) for why mounting two routers there
 *         costs one auth resolution, not two.
 *
 * See: docs/modules/addresses.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { addressesDeleteByUserId, addressesGet } from './service';
import { router } from './routes';

/** This module's manifest entry: routes, event subscriptions, and locales. */
export default {
    name: 'addresses',
    basePath: '/account',
    routes: router,
    personalData: [
        {
            section: 'addresses',
            collect: (subject) => addressesGet(subject.userId).then((view) => view.addresses),
            // DDD-D6: a destroyed account takes its address book with it, inside the same
            // transaction — see `addressesDeleteByUserId`.
            erase: addressesDeleteByUserId
        }
    ],
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
