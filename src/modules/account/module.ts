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
import { invalidTokenWindows } from './session/config';
import { requestAccountSetup } from './services/authentication';
import { router } from './routes';
import { accountRateLimits } from './rate-limits';
import { setPersonalDataSections } from './services/personal-data-registry';

/**
 * Everything this module installs once every enabled module is known (D15): the auth resolver the
 * whole app's guards depend on, plus its own `personalData` export list — the app tier used to
 * resolve that list and hand it in by name, which meant deleting this module also meant editing
 * `app.ts`.
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
    setPersonalDataSections(resolvePersonalDataSections([...modules]));
};

/** This module's manifest entry: routes, event subscriptions, and locales. */
export default {
    name: 'account',
    basePath: '/account',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: ['tokens.any.delete'],
    routes: router,
    /** The credential/signup/reset/MFA/password-check budgets — see `./rate-limits.ts`. */
    rateLimits: accountRateLimits,
    // No collection of its own — see the module docblock. `POST /account/export` assembles every
    // OTHER module's section; this module contributes none of its own data to it.
    personalData: 'none',
    /*
     * `.env-example` ships both as literal placeholders that sign and verify perfectly —
     * `getAccessTokenRing`/`getRefreshTokenRing` (`session/config.ts`) read `process.env.X ?? ''`
     * with no validation of their own. Each is an ordered, comma-separated key ring (newest
     * first, see `docs/modules/account-sessions.md`); `required-config.ts`'s `minLength`/
     * `placeholder` check applies to every comma-separated member, not the joined string, so a
     * rotated-in second entry left as the placeholder still refuses to boot. 16 rather than a
     * stricter minimum: this rejects empty and drastically truncated values without pretending to
     * assess real secret strength, which is an operator's job, not a boot-time character count.
     */
    requiredConfig: [
        { key: 'NODE_TOKEN_ACCESS', minLength: 16, placeholder: 'your-access-token-secret-here' },
        { key: 'NODE_TOKEN_REFRESH', minLength: 16, placeholder: 'your-refresh-token-secret-here' },
        // A TOTP secret encrypted under the shipped placeholder is recoverable by anyone who has
        // read this repository — same failure shape as the two above, same fix.
        {
            key: 'NODE_TOTP_ENCRYPTION_KEY',
            minLength: 16,
            placeholder: 'your-totp-encryption-key-here'
        }
    ],
    /*
     * The two token windows are independent variables with a required ORDER, which no per-key
     * check can express — see `session/config.ts#invalidTokenWindows` for why getting it wrong
     * disables reuse detection without failing anything.
     */
    customCheck: invalidTokenWindows,
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
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
