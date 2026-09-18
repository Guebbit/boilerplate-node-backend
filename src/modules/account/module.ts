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
 *              declares its own `personalData` section (`@kernel/registry.ts`), `src/app.ts`
 *              resolves the list at boot and hands it in through
 *              `./services/personal-data-registry.ts`, and this module only assembles what it is
 *              given. See `services/export.ts`.
 *
 * See: docs/modules/account.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerAuthResolver } from '@kernel/authentication';
import { rolesOf } from '@kernel/access/store';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { onDomainEvent } from '@kernel/events';
import { userService, USER_SETUP_REQUESTED } from '@modules/users';
import { verifyAccessToken, verifyRefreshToken, type TokenData } from './session/jwt';
import { requestAccountSetup } from './services/authentication';
import { router } from './routes';
import { accountRateLimits } from './rate-limits';

/** Published for `src/app.ts` alone — see `./services/personal-data-registry.ts`'s own docblock. */
export { setPersonalDataSections } from './services/personal-data-registry';

/*
 * This module answers the kernel's "who is making this request". Registered at import time
 * (installs a function, touches no connection) since every guard in the app depends on it being
 * there before the first request. The resolver rejects a bad token and resolves `undefined` for
 * a token whose user is gone — the distinction `requirePermissionViaCookie` turns into 401 versus 403.
 */

/**
 * Builds a `fromAccessToken`/`fromRefreshToken` resolver from either verifier.
 *
 * Keeps the verified `auth_time`/`amr` CLAIMS, not just `id`: this is the function that calls
 * `findAuthenticatableById`, and the two travel together — dropping the claims here would
 * silently discard what the caller worked to prove.
 */
const resolve = (verify: (token: string) => Promise<TokenData>) => (token: string) =>
    verify(token)
        // Scoped, not `findById`: a deactivated or soft-deleted account must stop authenticating
        // on its very next request, not merely at its next login. See `findAuthenticatableById`.
        // An MFA login challenge can never reach here at all — it isn't a JWT, so it fails
        // `verify()` outright rather than needing a dedicated rejection; see
        // `account/services/two-factor.ts#buildLoginChallenge`.
        .then((claims) =>
            userService.findAuthenticatableById(claims.id).then((user) => ({ user, claims }))
        )
        /*
         * The stored memberships, which are what a role assignment actually IS. The user row's own
         * `role` is the users module's published field and is not read here: two stores answering
         * one question is how they drift, and this is the one that authorization is decided from.
         */
        .then(({ user, claims }) =>
            (user
                ? rolesOf(user.id, DEPLOYMENT_TENANT_ID).then((roles) => ({
                      tenantId: DEPLOYMENT_TENANT_ID,
                      roles
                  }))
                : Promise.resolve({
                      tenantId: DEPLOYMENT_TENANT_ID,
                      roles: { tenant: null, platform: null }
                  })
            ).then((membership) => ({ user, claims, membership }))
        )
        /* Only the fields the port declares: the kernel must not learn the document shape. */
        .then(({ user, claims, membership }) =>
            user
                ? {
                      id: user.id,
                      email: user.email,
                      username: user.username,
                      /*
                       * `rolesOf`'s membership lookup, with no fallback: a role lives in exactly
                       * one place now. `null` in either scope means genuinely no role there — for
                       * `tenant` that is a rare, defensive case (every real signup path writes a
                       * membership immediately), for `platform` it is correct for almost everyone.
                       * `keysInScope` in `kernel/permissions.ts` is what turns a `null` role into
                       * the anonymous baseline (tenant) or an empty set (platform), never a guess.
                       *
                       * A stranger never reaches here at all — they are `guest`, via
                       * `anonymousCaller()`.
                       */
                      roles: membership.roles,
                      // The one shop this deployment is — `DEPLOYMENT_TENANT_ID`, a fixed constant
                      // rather than anything the request could name.
                      tenantId: membership.tenantId,
                      imageUrl: user.imageUrl,
                      // Absent (a token minted before this claim existed) reads as infinitely
                      // old — fail closed, so a pre-existing session is asked to re-authenticate
                      // at its first sensitive action rather than being treated as freshly
                      // authenticated.
                      authTime: claims.auth_time ?? 0,
                      amr: claims.amr ?? [],
                      // Read fresh off the document every request, unlike `authTime`/`amr`: a
                      // consent WITHDRAWAL has to apply to the very next event, not wait for the
                      // caller to log in again. `?? false` for the same reason as `admin` above —
                      // the schema defaults it, but the contract-derived type doesn't know that.
                      analyticsConsent: user.analyticsConsent ?? false
                  }
                : undefined
        );

// Installs the kernel's auth resolver at import time — see the note above for why here.
registerAuthResolver({
    fromAccessToken: resolve(verifyAccessToken),
    fromRefreshToken: resolve(verifyRefreshToken)
});

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
