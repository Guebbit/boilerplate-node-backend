import path from 'node:path';
import type { IAppModule } from '@kernel/registry';
import { registerAuthResolver } from '@kernel/authentication';
import { userRepository } from '@modules/users';
import { verifyAccessToken, verifyRefreshToken } from './jwt';
import { router } from './routes';

/**
 * Authentication and the account lifecycle: signup, login, refresh, password reset, logout
 * everywhere, and the two-step account deletion.
 *
 * Depends on `users` and owns no collection of its own. It is a second service over the same User
 * record — which is why the users barrel exports the model and repository rather than just its
 * service, and why these are two modules rather than one: `/account` and `/users` are different
 * mounts, and a manifest carries one `basePath`.
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
    basePath: '/account',
    routes: router,
    dependsOn: ['users'],
    locales: path.join(__dirname, 'locales')
} satisfies IAppModule;
