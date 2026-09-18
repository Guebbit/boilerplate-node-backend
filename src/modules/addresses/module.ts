/**
 * @module
 * The address book — one document per user, the shipping addresses a checkout resolves against.
 * Its own module so nothing has to import `account` for it: `cart`'s checkout is the only sibling
 * consumer, and `users` reaches it only through the event bus below, never an import.
 *
 * Owns:   the address book, outright.
 * Shares: the `/account` URL prefix with `account` — see `./routes.ts` and `getAuth`'s early
 *         return (`kernel/middlewares/authorizations.ts`) for why mounting two routers there
 *         costs one auth resolution, not two.
 *
 * See: docs/modules/account.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { USER_DELETED } from '@modules/users';
import { addressesDeleteByUserId } from './service';
import { router } from './routes';

/** This module's manifest entry: routes, event subscriptions, and locales. */
export default {
    name: 'addresses',
    basePath: '/account',
    routes: router,
    subscribe: () => {
        // A destroyed account takes its address book with it — the same event `account`, `cart`
        // and `wishlist` each listen for on their own collection.
        onDomainEvent(USER_DELETED, ({ userId }) => addressesDeleteByUserId(userId));
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
