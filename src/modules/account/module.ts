/**
 * @module
 * Authentication and the account lifecycle: signup, login, refresh, password reset, logout
 * everywhere, and the two-step account deletion. A second service over `users`' record rather
 * than a merged one — `/account` and `/users` are different mounts.
 *
 * Owns:        the address book, outright. The User record stays with `users`, kept replaceable
 *              for a future identity provider.
 * Shares:      the User document with `users` — the repo's one shared kernel, invisible to the
 *              import graph. Both read and write it, so a schema change there is agreed twice.
 * Reaches far: `POST /account/export`. A data export is inherently cross-cutting, and the
 *              alternative — an event asking each module to publish its own slice — is an async
 *              fan-out with nothing to wait on it. See `services/export.ts`.
 *
 * See: docs/modules/account.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerAuthResolver } from '@kernel/authentication';
import { rolesOf } from '@kernel/access/store';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { onDomainEvent } from '@kernel/events';
import { userRepository, USER_DELETED, USER_SETUP_REQUESTED } from '@modules/users';
import { verifyAccessToken, verifyRefreshToken, type TokenData } from './session/jwt';
import { addressesDeleteByUserId } from './services/addresses';
import { requestAccountSetup } from './services/authentication';
import { router } from './routes';

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
            userRepository.findAuthenticatableById(claims.id).then((user) => ({ user, claims }))
        )
        /*
         * The stored memberships, which are what a role assignment actually IS. The user row's own
         * `role` is the users module's published field and is not read here: two stores answering
         * one question is how they drift, and this is the one that authorization is decided from.
         */
        .then(({ user, claims }) =>
            (user
                ? rolesOf(user.id, DEPLOYMENT_TENANT_ID, {
                      // What the account itself says, for the account no membership names —
                      // an unseeded deployment, or a fixture written straight to the
                      // collection. A stored membership always wins over it. Platform has no
                      // such column of its own: `memberships` is the sole authority for that
                      // scope, so an account with none there simply holds no platform role.
                      tenant: user.role ?? 'customer',
                      platform: null
                  }).then((roles) => ({ tenantId: DEPLOYMENT_TENANT_ID, roles }))
                : Promise.resolve({
                      tenantId: DEPLOYMENT_TENANT_ID,
                      roles: { tenant: 'customer', platform: null }
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
                       * `rolesOf`'s membership lookup wins over both fallbacks. `tenant` falls
                       * back to the account's own `role` column — `customer` is the default for a
                       * row written before the field existed, the least-privileged answer and
                       * therefore the safe one. `platform` has no column to fall back to at all:
                       * `memberships` is the sole authority for that scope, so no row there means
                       * no platform role, which is correct for almost everyone.
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
                      analyticsConsent: user.analyticsConsent ?? false,
                      // Same "read fresh, never cache in the JWT" reasoning as `analyticsConsent`:
                      // a signup token minted before the mailbox is confirmed must not keep
                      // `requireVerified` open for its whole lifetime.
                      verified: user.verified ?? false
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
    permissions: ['tokens.delete'],
    routes: router,
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
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
