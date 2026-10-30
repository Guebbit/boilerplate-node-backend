/**
 * @module
 * What a session answer carries beyond its credential: the caller's abilities, the idle clock and,
 * on a sign-in, the account itself — so a client needs no follow-up read.
 *
 * Used by:  `GET /account`, the sign-in answers (login, its second step, restore) and refresh.
 * One rule: the client's copy of the abilities has NO authority. It decides what to RENDER, never
 *           what is allowed; every request is re-evaluated server-side.
 *
 * See: docs/modules/account.md
 */

import { packRules } from '@casl/ability/extra';
import { buildAbility } from '@kernel/ability';
import { grantableRoles } from '@modules/access';
import {
    callerInScope,
    permissionModelVersion,
    staffRoleWithheld,
    PERMISSION_RULES
} from '@kernel/permissions';
import { userService } from '@modules/users';
import type {
    Abilities,
    AccountView,
    AuthContext,
    AuthTokens,
    PackedRules,
    SessionActivity
} from '@types';
import { idleLimitMilliseconds } from './idle';
import { resolveProof } from './auth-context';
import type { IssuedSession } from './strategy';

/**
 * The permission model's own version.
 *
 * Bumped when the RULES change, not when a role does — a client caches these, and this is what
 * tells it the cache is about a different model rather than merely a different person. A
 * fingerprint of the declared set (see {@link permissionModelVersion}) rather than typed in or a
 * plain count, so a rule rename or swap cannot be forgotten either: only reordering the same set
 * leaves it unchanged, and editing a role never touches it at all.
 */
const modelVersion = permissionModelVersion(PERMISSION_RULES.map((entry) => entry.id));

/**
 * One scope's rules, in CASL's wire format.
 *
 * `packRules` is CASL's own: a tuple per rule with trailing absent members dropped, which is what
 * makes shipping a few dozen of them cheap. The frontend calls `unpackRules` and builds the same
 * `Ability` this server just built.
 * https://casl.js.org/v6/en/cookbook/cache-rules/
 *
 * @param caller - the caller as resolved in ONE scope; never both at once
 */
const rulesFor = (caller: Parameters<typeof buildAbility>[0]): PackedRules =>
    // The contract cannot spell a CASL tuple (OpenAPI has no tuple), so it declares each position as
    // a union without `undefined`; `packRules` leaves a trailing `undefined` where a rule has no
    // conditions. The wire drops it in JSON, so the cast only names what is sent.
    packRules(buildAbility(caller).rules) as PackedRules;

/**
 * The caller's rules in BOTH scopes, as two separate lists.
 *
 * Both, because a request acts in one scope and a CLIENT renders from two: the shop's screens read
 * tenant keys, the health dashboard reads `read:ObservabilitySnapshot`, and they share one
 * navigation. The two lists stay apart, because the model refuses to let either satisfy the other.
 *
 * @param context - the resolved signed-in caller
 */
export const abilitiesOf = (context: AuthContext): Abilities => {
    const tenant = callerInScope(context, 'tenant');
    return {
        // Absent rather than null for a caller with no shop: the contract has no nullable field.
        ...(tenant.tenantId ? { tenantId: tenant.tenantId } : {}),
        tenant: rulesFor(tenant),
        platform: rulesFor(callerInScope(context, 'platform')),
        // Same rule as the 409 the user writes answer, so the two cannot drift.
        grantableRoles: grantableRoles('tenant', tenant.permissions),
        secondFactorRequired: staffRoleWithheld(context),
        version: modelVersion
    };
};

/**
 * The session's idle clock as it stands now.
 *
 * @param context - the resolved signed-in caller
 * @returns `idleTimeoutSeconds` is absent for a caller no idle timeout applies to
 */
export const activityOf = (context: AuthContext): SessionActivity => {
    const limitMilliseconds = idleLimitMilliseconds(context.roles);
    return {
        lastActiveAt: new Date().toISOString(),
        ...(limitMilliseconds > 0 && { idleTimeoutSeconds: limitMilliseconds / 1000 })
    };
};

/**
 * What `GET /account` answers: the account plus the abilities and the idle clock.
 *
 * @param user - the account, as the users module reads it (with its pending email)
 * @param context - the resolved signed-in caller
 */
export const accountViewOf = (
    user: Parameters<typeof userService.toAccount>[0],
    context: AuthContext
): AccountView => ({
    ...userService.toAccount(user, context.roles.tenant),
    abilities: abilitiesOf(context),
    activity: activityOf(context)
});

/**
 * The abilities a refresh answers with, so a role granted mid-session shows within one refresh.
 *
 * @param userId - whose session was refreshed
 * @returns `undefined` when the account may no longer authenticate
 */
export const abilitiesOfUser = (userId: string): Promise<Abilities | undefined> =>
    // The abilities read nothing of the proof, so "just now" is as good as the real `auth_time`.
    resolveProof(userId, { authTime: Math.floor(Date.now() / 1000), amr: [] }).then((context) =>
        context ? abilitiesOf(context) : undefined
    );

/**
 * The sign-in answer: the minted credential plus the account view, so no follow-up read is needed.
 *
 * @param issued - what the session strategy minted
 * @param userId - whose session it is
 * @param proof - how and when the sign-in was proved (the new session's own `amr`)
 * @returns the credential alone when the account vanished between the mint and this read
 */
export const withAccountView = (
    issued: IssuedSession,
    userId: string,
    proof: { amr: readonly string[]; provedAt: number }
): Promise<AuthTokens> =>
    Promise.all([
        resolveProof(userId, { authTime: Math.floor(proof.provedAt / 1000), amr: proof.amr }),
        userService.findByIdWithPendingEmail(userId)
    ]).then(([context, user]) =>
        context && user ? { ...issued, account: accountViewOf(user, context) } : issued
    );
