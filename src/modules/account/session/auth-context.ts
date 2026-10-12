/**
 * @module
 * From "this session proved itself at `authTime` as `amr`" to the `AuthContext` a guard reads —
 * the half of resolving a request that both session modes share. The mode only decides how a
 * credential becomes a proof; what a proof means (the account may still sign in, the epoch has not
 * passed it, the roles it holds right now) is decided here, once.
 */

import { rolesOf } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { userService } from '@modules/users';
import type { AuthContext } from '@types';
import { predatesSessionEpoch } from './epoch';

/** What a session has proved: when the account last actually proved itself, and how. */
export interface SessionProof {
    /** Epoch seconds of the last real proof — copied forward on a refresh, renewed only by reauth. */
    authTime: number;
    /** How it was proved, RFC 8176 values. */
    amr: readonly string[];
}

/**
 * Resolve an account and its proof into the caller context, or `undefined` when nobody may act.
 *
 * Scoped, not `findById`: a deactivated or soft-deleted account stops authenticating on its very
 * next request, not merely at its next login. A proof older than the account's session epoch is
 * refused exactly like an unknown account, so nothing downstream tells them apart. Roles are read
 * fresh: the stored memberships are what a role assignment actually IS — the user document
 * carries no `role` of its own.
 *
 * @param userId - the account the session belongs to
 * @param proof - what the session proved
 * @returns the caller context, or `undefined` for an account that may not authenticate
 */
export const resolveProof = (
    userId: string,
    proof: SessionProof
): Promise<AuthContext | undefined> =>
    userService.findAuthenticatableById(userId).then((user) => {
        if (!user || predatesSessionEpoch(proof.authTime, user.tokensValidAfter)) return undefined;

        return rolesOf(user.id, DEPLOYMENT_TENANT_ID).then(
            (roles): AuthContext => ({
                id: user.id,
                email: user.email,
                username: user.username,
                // `rolesOf`'s membership lookup, with no fallback: a role lives in exactly one
                // place. `null` in either scope means genuinely no role there, which
                // `keysInScope` (`kernel/permissions.ts`) turns into the anonymous baseline
                // (tenant) or an empty set (platform), never a guess.
                roles,
                // The one shop this deployment is — a fixed constant, never anything the request
                // could name.
                tenantId: DEPLOYMENT_TENANT_ID,
                imageUrl: user.imageUrl,
                authTime: proof.authTime,
                amr: [...proof.amr],
                // Read fresh, like `analyticsConsent`: arming or removing a factor applies to the
                // very next request, whatever the session carries.
                twoFactorArmed: user.twoFactorEnabledAt !== undefined,
                // A consent WITHDRAWAL has to apply to the very next event, not wait for the
                // caller to log in again. `?? false`: the schema defaults it, the contract-derived
                // type does not know that.
                analyticsConsent: user.analyticsConsent ?? false
            })
        );
    });
