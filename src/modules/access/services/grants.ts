/**
 * @module
 * Who may hand out which role: a role nothing declares is refused, and so is a granter without
 * `assign:Role`. Every rule here is a REFUSAL rather than a note in a docblock — the check
 * that is not executed is the check that is not true.
 *
 * See: docs/theory/authorization.md · `shared/authorization-roles.yaml`
 */

import type { AuthorizationScope, CallerContext } from '@types';
import { findRole, PRESET_ROLES } from '@kernel/permissions';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { ConflictError } from '@infrastructure/http/errors';
import { accessAuditActions } from '../audit';
import { auditRoleChange } from './role-audit';

/**
 * The one permission that protects people: whoever holds it may hand out a staff role and change an
 * account that already holds one. Declared in this module's `authorization.yaml`.
 */
export const ASSIGN_RULE = 'assign:Role';

/**
 * Raised when a write would assign a role nothing declares, or grant more than the granter holds.
 * Extends the infrastructure-owned {@link ConflictError}: this module's own name, `infrastructure`'s
 * own recognised shape — `databaseErrorInterpreter` (`infrastructure/http/errors.ts`) maps any
 * `ConflictError` to 409 by `instanceof`, never by knowing `access` exists.
 */
export class AccessInvariantError extends ConflictError {
    /** @param message - which invariant the write would have broken. */
    constructor(message: string) {
        super(message);
        this.name = 'AccessInvariantError';
    }
}

/** The verdict of {@link checkGrant}: the lowered role name, or why the grant is refused. */
type GrantVerdict = { lowered: string } | { refusal: string };

/**
 * The boolean core of {@link validateGrant}: asks whether a grant would be accepted and, when it
 * would not, says why — without throwing, so {@link grantableRoles} can ask once per role.
 *
 * Refuses two things, and each refusal is an invariant of the model:
 *
 *   - **a role nothing declares** — assigning a name no row and no preset defines produces a
 *     member who can do nothing and looks like a member who can. There is no role editor in this
 *     codebase: a role's permissions come only from `shared/authorization-roles.yaml`'s presets,
 *     never a caller-supplied list, so every key a resolved role can hold is already a declared
 *     one by construction —`tests/cross-cutting/authorization-keys.test.ts` is what proves that
 *     for every preset, once, rather than this function re-checking it on every grant. `customer`,
 *     `unverified` and `guest` are such names: an audience is computed, never granted;
 *   - **a granter without `assign:Role`** — handing out a staff role is the one act that
 *     widens a person's powers, so it has one permission of its own instead of being implied by
 *     the keys of the roles being handed out.
 *
 * @param granter - the keys the person MAKING the grant holds, or `undefined` for a seeder, a
 *   migration or an operator on the console — the three callers with nobody to escalate from
 */
const checkGrant = (
    scope: AuthorizationScope,
    roleName: string,
    granter?: readonly string[]
): GrantVerdict => {
    const lowered = roleName.toLowerCase();
    const role = findRole(lowered);

    if (role?.scope !== scope) {
        return {
            refusal:
                `[access] "${roleName}" is not a role in this ${scope} scope. ` +
                `Declare it in shared/authorization-roles.yaml first, or assign one that exists.`
        };
    }

    if (role.assignable === false) {
        return { refusal: `[access] "${roleName}" is never assigned to an account.` };
    }

    if (granter && !granter.includes(ASSIGN_RULE)) {
        return {
            refusal:
                `[access] cannot grant "${roleName}": the granter does not hold ${ASSIGN_RULE}. ` +
                `A role editor that allows this is a privilege-escalation endpoint.`
        };
    }

    return { lowered };
};

/**
 * The synchronous half of {@link assignRole}: refuses what {@link checkGrant} refuses, and returns
 * the lowered role name for the caller to act on. Split out so {@link assertCanGrant} can ask
 * "would this succeed" before committing other state, without a compensating rollback if the grant
 * turns out to be refused — see `users/services/update.ts`'s `saveWithRole`.
 *
 * @param granter - same meaning as in {@link checkGrant}
 * @throws AccessInvariantError for either reason {@link checkGrant} gives
 */
export const validateGrant = (
    scope: AuthorizationScope,
    roleName: string,
    granter?: readonly string[]
): string => {
    const verdict = checkGrant(scope, roleName, granter);
    if ('refusal' in verdict) throw new AccessInvariantError(verdict.refusal);
    return verdict.lowered;
};

/**
 * The roles a granter may assign in a scope: every preset of that scope that the write path's own
 * rule ({@link validateGrant}) would accept. A client builds its role picker from this, so the
 * picker and the `409` can never disagree. It has no authority: the write re-checks.
 *
 * @param scope - the scope the roles are assigned in
 * @param granter - the keys the person making the grant holds in that scope
 * @returns the role names, in the order `shared/authorization-roles.yaml` declares them
 */
export const grantableRoles = (scope: AuthorizationScope, granter: readonly string[]): string[] =>
    PRESET_ROLES.filter(
        (role) => role.scope === scope && !('refusal' in checkGrant(scope, role.name, granter))
    ).map((role) => role.name);

/**
 * Would {@link assignRole} succeed, without writing anything — for a caller that needs to know
 * BEFORE it commits other state, since a refused grant discovered afterwards means either a
 * rollback or a half-applied update. See `users/services/update.ts`'s `saveWithRole`, which validates
 * a role change before saving the rest of the document.
 *
 * @param granter - same meaning as {@link assignRole}'s own parameter
 * @throws AccessInvariantError for the same two reasons `assignRole` refuses
 */
export const assertCanGrant = (
    scope: AuthorizationScope,
    roleName: string,
    granter?: readonly string[]
): void => {
    validateGrant(scope, roleName, granter);
};

/**
 * {@link assertCanGrant} for a caller that writes more than the membership: a refusal is audited
 * as a failed grant FIRST, then thrown, so the attempt leaves its row even though nothing was
 * written. It is the check an account create or update runs before it opens its transaction.
 *
 * @param granter - same meaning as {@link assignRole}'s own parameter
 * @param context - the caller, whose refused attempt is audited
 * @param userId - the account the grant is for, or `undefined` when it does not exist yet
 * @throws AccessInvariantError for the same two reasons `assignRole` refuses
 */
export const assertCanGrantAudited = (
    scope: AuthorizationScope,
    roleName: string,
    granter: readonly string[] | undefined,
    context: CallerContext,
    userId?: string
): void => {
    const verdict = checkGrant(scope, roleName, granter);
    if (!('refusal' in verdict)) return;

    auditRoleChange(
        context,
        accessAuditActions.ROLE_ASSIGNED,
        'failure',
        userId,
        roleName.toLowerCase(),
        scope === 'tenant' ? DEPLOYMENT_TENANT_ID : null,
        scope
    );
    throw new AccessInvariantError(verdict.refusal);
};
