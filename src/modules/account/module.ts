/**
 * @module
 * Authentication and the account lifecycle: signup, login, refresh, password reset, logout
 * everywhere, and the two-step account deletion. A second service over `users`' record rather
 * than a merged one — `/account` and `/users` are different mounts.
 *
 * Owns:        no collection of its own — the address book moved to `addresses`. The User record
 *              stays with `users`, kept replaceable for a future identity provider.
 * Shares:      the User document with `users` — the repo's one shared kernel, invisible to the
 *              import graph. Both read and write it, so a schema change there is agreed twice.
 * Reaches far: `POST /account/export`, without an import graph to show for it — every module
 *              declares its own `personalData` section (`@kernel/registry.ts`), this module's own
 *              `onRegistered` hook resolves the list once every module is known and hands it in
 *              through `./services/personal-data-registry.ts`, and this module only assembles
 *              what it is given. See `services/export.ts`.
 *
 * See: docs/modules/account.md
 */

import path from 'node:path';
import { type AppModule, resolvePersonalDataSections } from '@kernel/registry';
import { registerAuthResolver } from '@kernel/authentication';
import { onDomainEvent } from '@kernel/events';
import { userService, USER_SETUP_REQUESTED } from '@modules/users';
import { accountAuthResolver } from './session/resolver';
import { accountConfig } from './config';
import { sessionConfig } from './session/config';
import { oauthConfig } from './oauth/config';
import { requestAccountSetup } from './services/authentication';
import { router } from './routes';
import { accountRateLimits } from './rate-limits';
import { setPersonalDataSections } from './services/personal-data-registry';

/**
 * Everything this module installs once every enabled module is known: the auth resolver the whole
 * app's guards depend on, plus its own `personalData` export list — resolved here, by this module,
 * rather than by the app tier collecting it and handing it in by name.
 *
 * The resolver is registered HERE rather than at import time, so importing this file (a type, a
 * test) no longer installs it — only a module `registerModules` actually runs `onRegistered` for
 * does. The resolver itself rejects a bad token and resolves `undefined` for a token whose user is
 * gone — the distinction `requirePermissionViaCookie` turns into 401 versus 403. The resolution
 * logic lives in `./session/resolver.ts`, alongside the rest of the session machinery; this file
 * only installs it.
 *
 * @param modules - every enabled module, for `POST /account/export`'s section list
 */
const onRegistered = (modules: readonly AppModule[]): void => {
    registerAuthResolver(accountAuthResolver);
    setPersonalDataSections(resolvePersonalDataSections(modules));
};

/** This module's manifest entry: routes, event subscriptions, and locales. */
export default {
    name: 'account',
    basePath: '/account',
    routes: router,
    /** The credential/signup/reset/MFA/password-check budgets — see `./rate-limits.ts`. */
    rateLimits: accountRateLimits,
    // No collection of its own — see the module docblock. `POST /account/export` assembles every
    // OTHER module's section; this module contributes none of its own data to it.
    personalData: 'none',
    // Token rings, the token windows and the second-factor key: see `./session/config.ts`.
    config: [accountConfig.slice, sessionConfig.slice, oauthConfig.slice],
    onRegistered,
    subscribe: () => {
        /*
         * `users` creates a passwordless account and asks for a way in; this module owns the
         * tokens and mail that provide one. A deleted user before the event fires resolves to
         * `undefined` and the request is simply dropped — nobody is left to email.
         */
        onDomainEvent(USER_SETUP_REQUESTED, ({ userId }) =>
            userService.getById(userId).then((user) => user && requestAccountSetup(user))
        );
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
