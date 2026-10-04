/**
 * @module
 * Authentication and the account lifecycle: signup, login, refresh, password reset, logout
 * everywhere, and the two-step account deletion. A second service over `users`' record rather
 * than a merged one — `/account` and `/users` are different mounts.
 *
 * Owns:        `accountexports`, one row per account that asked for its data. The address book
 *              moved to `addresses`; the User record stays with `users`, kept replaceable for a
 *              future identity provider.
 * Shares:      the User document with `users` — the repo's one shared kernel, invisible to the
 *              import graph. Both read and write it, so a schema change there is agreed twice.
 * Reaches far: `POST /account/export`, without an import graph to show for it — every module
 *              declares its own `personalData` section (`@kernel/registry.ts`), this module's own
 *              `onRegistered` hook resolves the list once every module is known and hands it in
 *              through `./services/personal-data-registry.ts`, and the export worker only
 *              assembles what it is given. See `services/export-job.ts`.
 * Queue:       `worker.account.export`, consumed here (`consumers`), declared in
 *              `./asyncapi.internal.yaml`.
 *
 * See: docs/modules/account.md
 */

import path from 'node:path';
import { type AppModule, resolvePersonalDataSections } from '@kernel/registry';
import { WORKER_CHANNELS, AccountExportJobPayloadSchema } from '@types';
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
import { eraseExports } from './services/export';
import { runExportJob } from './services/export-job';

/**
 * Everything this module installs once every enabled module is known: the auth resolver the whole
 * app's guards depend on, plus its own `personalData` export list — resolved here, by this module,
 * rather than by the app tier collecting it and handing it in by name.
 *
 * The resolver is registered HERE rather than at import time, so importing this file (a type, a
 * test) does not install it — only a module `registerModules` actually runs `onRegistered` for
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
    /*
     * The export build assembles every OTHER module's section; this module's own collection holds
     * the export itself, which is a COPY of what the sections already say. So it contributes no
     * data to an export (`collect` resolves `undefined`, which omits the section) and only
     * declares how an account's export row and file are erased with the account.
     */
    personalData: [
        {
            section: 'accountExports',
            collect: () => Promise.resolve(undefined),
            erase: eraseExports
        }
    ],
    /*
     * `prefetch: 1` — a build reads every section of one account, the heaviest job this module
     * runs; one at a time per worker keeps a burst of requests from starving the others.
     */
    consumers: [
        {
            queue: WORKER_CHANNELS.ACCOUNT_EXPORT,
            handler: runExportJob,
            schema: AccountExportJobPayloadSchema,
            prefetch: 1
        }
    ],
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
