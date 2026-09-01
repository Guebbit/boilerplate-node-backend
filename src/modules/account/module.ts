/**
 * @module
 * Authentication and the account lifecycle: signup, login, refresh, password reset, logout
 * everywhere, and the two-step account deletion. A second service over `users`' record rather
 * than a merged one — `/account` and `/users` are different mounts. The address book is the one
 * collection this module owns outright; the User record stays with `users`, kept replaceable for
 * a future identity provider.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      users
 * Reached by:   cart
 * Not imports:  shares the User document with `users` — the one shared kernel in the repo. Both
 *               read and write it, so a schema change there has to be agreed twice.
 *
 * See: docs/modules/account.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerAuthResolver } from '@kernel/authentication';
import { onDomainEvent } from '@kernel/events';
import { userRepository, USER_DELETED, USER_SETUP_REQUESTED } from '@modules/users';
import { verifyAccessToken, verifyRefreshToken } from './session/jwt';
import { addressesDeleteByUserId } from './services/addresses';
import { requestAccountSetup } from './services/authentication';
import { exportSeededAddressBooks, seedAddressBooksCollection } from './demo';
import { router } from './routes';

/*
 * This module answers the kernel's "who is making this request". Registered at import time
 * (installs a function, touches no connection) since every guard in the app depends on it being
 * there before the first request. The resolver rejects a bad token and resolves `undefined` for
 * a token whose user is gone — the distinction `isAdminViaCookie` turns into 401 versus 403.
 */

/** Builds a `fromAccessToken`/`fromRefreshToken` resolver from either verifier. */
const resolve = (verify: (token: string) => Promise<{ id: string }>) => (token: string) =>
    verify(token)
        // Scoped, not `findById`: a deactivated or soft-deleted account must stop authenticating
        // on its very next request, not merely at its next login. See `findAuthenticatableById`.
        .then(({ id }) => userRepository.findAuthenticatableById(id))
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

// Installs the kernel's auth resolver at import time — see the note above for why here.
registerAuthResolver({
    fromAccessToken: resolve(verifyAccessToken),
    fromRefreshToken: resolve(verifyRefreshToken)
});

/** This module's manifest entry: routes, event subscriptions, demo seeding, and locales. */
export default {
    name: 'account',
    basePath: '/account',
    routes: router,
    /*
     * BETTER_SECURITY.md wave 2.1: `.env-example` ships both as literal placeholders that sign
     * and verify perfectly — `getAccessTokenSecret`/`getRefreshTokenSecret` (`session/config.ts`)
     * read `process.env.X ?? ''` with no validation of their own. 16 rather than a stricter
     * minimum: this rejects empty and drastically truncated values without pretending to assess
     * real secret strength, which is an operator's job, not a boot-time character count.
     */
    requiredConfig: [
        { key: 'NODE_TOKEN_ACCESS', minLength: 16, placeholder: 'your-access-token-secret-here' },
        { key: 'NODE_TOKEN_REFRESH', minLength: 16, placeholder: 'your-refresh-token-secret-here' }
    ],
    subscribe: () => {
        // A destroyed account takes its address book with it — the same event cart and wishlist listen for.
        onDomainEvent(USER_DELETED, ({ userId }) => addressesDeleteByUserId(userId));
        /*
         * `users` creates a passwordless account and asks for a way in; this module owns the
         * tokens and mail that provide one. A deleted user before the event fires resolves to
         * `undefined` and the request is simply dropped — nobody is left to email.
         */
        onDomainEvent(USER_SETUP_REQUESTED, ({ userId }) =>
            userRepository.findById(userId).then((user) => user && requestAccountSetup(user))
        );
    },
    seeds: seedAddressBooksCollection,
    seedExport: exportSeededAddressBooks,
    /* A book is never served raw: `GET /account/addresses` answers `{ addresses: [...] }`,
     * which carries the book's `items` and nothing else it holds. */
    demoShapes: { addressBooks: 'stored' },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
