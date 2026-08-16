import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerAuthResolver } from '@kernel/authentication';
import { onDomainEvent } from '@kernel/events';
import { userRepository, USER_DELETED } from '@modules/users';
import { verifyAccessToken, verifyRefreshToken } from './session/jwt';
import { addressesDeleteByUserId } from './services/addresses';
import { exportSeededAddressBooks, seedAddressBooksCollection } from './seeds';
import { router } from './routes';

/**
 * Authentication and the account lifecycle: signup, login, refresh, password reset, logout
 * everywhere, and the two-step account deletion.
 *
 * Depends on `users`, over whose record it is a second service — which is why the users barrel
 * exports the model and repository rather than just its service, and why these are two modules
 * rather than one: `/account` and `/users` are different mounts, and a manifest carries one
 * `basePath`.
 *
 * It does own one collection outright, and only one: the address book (see `seeds` below and
 * `./model`). The User record is not it — that belongs to `users` and is reached
 * through its barrel.
 *
 * The arrow points one way. Nothing in `users` reaches back into authentication, so there is no
 * cycle here and no domain event is needed.
 */
/*
 * This module answers the kernel's "who is making this request".
 *
 * Registered at import time rather than in a boot step: it installs a function, touches no
 * connection, and every guard in the app depends on it being there before the first request. The
 * resolver rejects on a bad token and resolves `undefined` for a token whose user is gone — the
 * distinction `isAdminViaCookie` turns into 401 versus 403.
 */
const resolve = (verify: (token: string) => Promise<{ id: string }>) => (token: string) =>
    verify(token)
        .then(({ id }) => userRepository.findById(id))
        /* Only the fields the port declares: the kernel must not learn the document shape. */
        .then((user) =>
            user
                ? {
                      id: user.id,
                      email: user.email,
                      username: user.username,
                      admin: user.admin ?? false,
                      imageUrl: user.imageUrl
                  }
                : undefined
        );

registerAuthResolver({
    fromAccessToken: resolve(verifyAccessToken),
    fromRefreshToken: resolve(verifyRefreshToken)
});

export default {
    name: 'account',
    /*
     * Signup, login, refresh, reset. There is no version of this that is a competitive advantage,
     * and every deployment that outgrows it replaces it with an identity provider rather than
     * modelling it harder.
     */
    subdomain: 'generic',
    language: {
        Session:
            'Proof of who is asking, carried in cookies. An access token to spend and a refresh token to renew it.',
        'Access token':
            'Short-lived bearer of identity. Never stored — if it is valid it is trusted.',
        'Refresh token':
            'Long-lived, revocable, stored on the User record. Losing it is what logging out means.',
        Address:
            'An entry in the account’s address book. The one collection this module owns outright.',
        'Account deletion':
            'Two steps — a request that issues a token, and a confirm that destroys the record. Never one call.'
    },
    basePath: '/account',
    routes: router,
    dependsOn: [
        {
            module: 'users',
            as: 'shared-kernel',
            because:
                'Both modules read and write the same User record: `users` administers it, this module authenticates it. The only shared kernel in the repo, and the reason the users barrel exports its model and repository at all.'
        }
    ],
    /*
     * The one collection this module owns is the address book — the account lifecycle's own
     * data, unlike the User record it administers through `users`. A destroyed account takes
     * its book with it, by the same event the cart and wishlist listen for.
     */
    subscribe: () => {
        onDomainEvent(USER_DELETED, ({ userId }) => addressesDeleteByUserId(userId));
    },
    seeds: seedAddressBooksCollection,
    seedExport: exportSeededAddressBooks,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
