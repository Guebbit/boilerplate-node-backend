/**
 * @module
 * The kernel's `AuthResolver`, built from this module's two JWT verifiers — turns a verified
 * access/refresh token's claims into the `AuthContext` a guard checks. `module.ts` installs
 * {@link accountAuthResolver} via `registerAuthResolver` at import time; the resolution logic
 * itself lives here, alongside the rest of the session machinery.
 *
 * See: docs/modules/account-sessions.md
 */

import type { AuthResolver } from '@kernel/authentication';
import { rolesOf } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { userService } from '@modules/users';
import type { AuthContext } from '@types';
import { verifyAccessToken, verifyRefreshToken, type TokenData } from './jwt';

/**
 * Builds a `fromAccessToken`/`fromRefreshToken` resolver from either verifier.
 *
 * Keeps the verified `auth_time`/`amr` CLAIMS, not just `id`: this is the function that calls
 * `findAuthenticatableById`, and the two travel together — dropping the claims here would
 * silently discard what the caller worked to prove.
 */
const resolve =
    (verify: (token: string) => Promise<TokenData>) =>
    (token: string): Promise<AuthContext | undefined> =>
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
             * The stored memberships, which are what a role assignment actually IS. The user document
             * carries no `role` field of its own — `@modules/access`'s membership rows are the only
             * place one is stored — so this is the one and only place authorization is decided from.
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
                          // `TokenData.auth_time`/`amr` are required — see that interface's own doc
                          // for why no token this app verifies can be missing either.
                          authTime: claims.auth_time,
                          amr: claims.amr,
                          // Read fresh off the document every request, unlike `authTime`/`amr`: a
                          // consent WITHDRAWAL has to apply to the very next event, not wait for the
                          // caller to log in again. `?? false` for the same reason as `admin` above —
                          // the schema defaults it, but the contract-derived type doesn't know that.
                          analyticsConsent: user.analyticsConsent ?? false
                      }
                    : undefined
            );

/**
 * This module's answer to the kernel's "who is making this request" port — see `module.ts`'s own
 * comment for why it is registered at import time.
 */
export const accountAuthResolver: AuthResolver = {
    fromAccessToken: resolve(verifyAccessToken),
    fromRefreshToken: resolve(verifyRefreshToken)
};
