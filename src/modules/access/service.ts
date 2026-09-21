/**
 * @module
 * Reading and writing the authorization model — and refusing the writes that would make it lie:
 * an undeclared role, or a grant the granter could not make themselves.
 *
 * Every rule below is one somebody learned the expensive way, and each is a REFUSAL rather than a
 * note in a docblock. A model whose invariants are documented is a model whose invariants drift:
 * the check that is not executed is the check that is not true.
 *
 * See: docs/theory/authorization.md · `shared/authorization-roles.yaml`
 */

import type { AuthorizationScope, CallerContext } from '@types';
import { findRole, PERMISSION_KEYS, PRESET_ROLES } from '@kernel/permissions';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import type { AuditAction } from '@infrastructure/observability/audit';
import { membershipRepository, tenantRepository } from './repository';
import type { MembershipDocument, TenantDocument } from './model';
import { accessAuditActions } from './audit';

/** The one role self-service signup (or an OAuth signup a provider already vouches for) may ever
 * grant — never a caller-supplied name. See {@link assignDefaultRole}. */
export const SIGNUP_DEFAULT_ROLE = 'unverified';

/** What `unverified` promotes to once the address is proven. See {@link promoteVerifiedCustomer}. */
export const VERIFIED_CUSTOMER_ROLE = 'customer';

/**
 * The one tenant key {@link validateGrant} exempts `VERIFIED_CUSTOMER_ROLE` from needing, held by
 * a granter creating accounts outright. A caller who may create accounts at all must be able to
 * hand out the role every account starts with, even short of `customer`'s own keys
 * (`orders.self.read`, `payments.self.read`) — those are power over the GRANTEE's own data, never
 * over the granter's shop, so they were never the escalation the check exists to catch.
 */
const CREATE_USER_KEY = 'users.any.create';

/** Raised when a write would assign a role nothing declares, or grant more than the granter holds. */
export class AccessInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AccessInvariantError';
    }
}

/**
 * Create a shop, or return the one already carrying that slug.
 *
 * `id` is optional and only {@link bootstrapAccessModel} passes one — the fixed
 * `DEPLOYMENT_TENANT_ID` every deployment reads directly, so the row keeps the same id across an
 * `emptyDatabase()` + reseed cycle rather than minting a fresh one.
 */
export const ensureTenant = (slug: string, name: string, id?: string): Promise<TenantDocument> =>
    tenantRepository.upsertBySlug(slug.toLowerCase(), name, id);

/** Every place a person holds a role. One row per place; a person may appear in several. */
export const membershipsOf = (userId: string): Promise<MembershipDocument[]> =>
    membershipRepository.findByUserId(userId);

/** The person's role in one place, or `null` when they are not a member of it. */
export const membershipIn = (
    userId: string,
    tenantId: string | null,
    scope: AuthorizationScope
): Promise<MembershipDocument | null> => membershipRepository.findOne(userId, tenantId, scope);

/**
 * The synchronous half of {@link assignRole}: refuses the same two things, and returns the
 * lowered role name for the caller to act on. Split out so {@link assertCanGrant} can ask "would
 * this succeed" before committing other state, without a compensating rollback if the grant turns
 * out to be refused — see `users/service.ts`'s `updateSavedUser`.
 *
 * Refuses two things, and each refusal is an invariant of the model:
 *
 *   - **a role nothing declares** — assigning a name no row and no preset defines produces a
 *     member who can do nothing and looks like a member who can. There is no role editor in this
 *     codebase: a role's permissions come only from `shared/authorization-roles.yaml`'s presets,
 *     never a caller-supplied list, so every key a resolved role can hold is already a declared
 *     one by construction —`tests/cross-cutting/authorization-keys.test.ts` is what proves that
 *     for every preset, once, rather than this function re-checking it on every grant;
 *   - **granting what the granter does not hold** — otherwise every grant is a
 *     privilege-escalation endpoint, which is the single most common way these systems fail. One
 *     named exception: `CREATE_USER_KEY`'s own docblock.
 *
 * @param granter - the keys the person MAKING the grant holds, or `undefined` for a seeder, a
 *   migration or an operator on the console — the three callers with nobody to escalate from
 * @throws AccessInvariantError for either reason above
 */
const validateGrant = (
    scope: AuthorizationScope,
    roleName: string,
    granter?: readonly string[]
): string => {
    const lowered = roleName.toLowerCase();
    const role = findRole(lowered);
    const permissions = role?.scope === scope ? role.permissions : undefined;

    if (!permissions) {
        throw new AccessInvariantError(
            `[access] "${roleName}" is not a role in this ${scope} scope. ` +
                `Declare it in shared/authorization-roles.yaml first, or assign one that exists.`
        );
    }

    const exempt =
        scope === 'tenant' &&
        lowered === VERIFIED_CUSTOMER_ROLE &&
        Boolean(granter?.includes(CREATE_USER_KEY));

    if (granter && !exempt) {
        const held = new Set(granter);
        const escalated = permissions.filter((key) => !held.has(key));

        if (escalated.length > 0) {
            throw new AccessInvariantError(
                `[access] cannot grant "${roleName}": it holds ${escalated.join(', ')}, ` +
                    `which the granter does not. A role editor that allows this is a ` +
                    `privilege-escalation endpoint.`
            );
        }
    }

    return lowered;
};

/**
 * Would {@link assignRole} succeed, without writing anything — for a caller that needs to know
 * BEFORE it commits other state, since a refused grant discovered afterwards means either a
 * rollback or a half-applied update. See `users/service.ts`'s `updateSavedUser`, which validates
 * a role change before saving the rest of the document.
 *
 * @param granter - same meaning as {@link assignRole}'s own parameter
 * @throws AccessInvariantError for the same three reasons `assignRole` refuses
 */
export const assertCanGrant = (
    scope: AuthorizationScope,
    roleName: string,
    granter?: readonly string[]
): void => {
    validateGrant(scope, roleName, granter);
};

/**
 * One audit row for a role grant or revoke, success or failure — {@link assignRole}/
 * {@link revokeRole} each had four near-identical `emitAuditEvent`/`buildAuditEvent` blocks
 * before this, and it was exactly that duplication that let one of them (revoke's failure branch)
 * quietly drop `role` from its metadata while the other three kept it.
 *
 * @param role - `undefined` when nothing was there to name (an assign's `roleName` is always
 *   known; a revoke with no membership found, or whose role wasn't yet resolved when it failed,
 *   has none) — omitted from `metadata` rather than sent as `undefined`
 */
const auditRoleChange = (
    context: CallerContext,
    action: AuditAction,
    outcome: 'success' | 'failure',
    userId: string,
    role: string | undefined,
    tenantId: string | null,
    scope: AuthorizationScope
): void => {
    emitAuditEvent(
        buildAuditEvent(context, {
            action,
            outcome,
            target_type: 'user',
            target_id: userId,
            metadata: role === undefined ? { tenantId, scope } : { role, tenantId, scope }
        })
    );
};

/**
 * Give somebody a role in a place. See {@link validateGrant} for what this refuses.
 *
 * @param granter - the keys the person MAKING the grant holds, or `undefined` for a seeder, a
 *   migration or an operator on the console — the three callers with nobody to escalate from
 * @param context - the caller context to audit this grant (or its refusal) against. `undefined`
 *   for a self-service/system caller with no request to attribute it to — see
 *   {@link assignDefaultRole} and `users/service.ts`'s `USER_SETUP_REQUESTED` handler for the same
 *   reasoning. An escalation attempt is audited as a FAILURE, not skipped: it is the single most
 *   useful entry this vocabulary can produce.
 * @throws AccessInvariantError synchronously refused as a REJECTION, never a thrown exception —
 *   every check below runs inside the promise chain on purpose, so a caller doing
 *   `assignRole(...).catch(...)` (every caller in this codebase does) sees a rejection, not an
 *   uncaught throw. `Promise.resolve().then(...)` is what buys that for code with no `await` of
 *   its own to make it genuinely asynchronous.
 */
export const assignRole = (
    userId: string,
    tenantId: string | null,
    scope: AuthorizationScope,
    roleName: string,
    granter?: readonly string[],
    context?: CallerContext
): Promise<MembershipDocument> => {
    const attempt = Promise.resolve()
        .then(() => validateGrant(scope, roleName, granter))
        .then((lowered) => membershipRepository.upsertRole(userId, tenantId, scope, lowered));

    if (!context) return attempt;

    return attempt.then(
        (membership) => {
            auditRoleChange(
                context,
                accessAuditActions.ROLE_ASSIGNED,
                'success',
                userId,
                roleName.toLowerCase(),
                tenantId,
                scope
            );
            return membership;
        },
        (error: unknown) => {
            auditRoleChange(
                context,
                accessAuditActions.ROLE_ASSIGNED,
                'failure',
                userId,
                roleName.toLowerCase(),
                tenantId,
                scope
            );
            throw error;
        }
    );
};

/**
 * The only role self-service signup (or an OAuth signup a provider already vouches for) may ever
 * grant. Deliberately NOT `assignRole` with a caller-supplied name: a signup endpoint that could
 * assign any role would be a privilege-escalation door, so this function's whole job is to make
 * that request impossible to express — there is no `roleName` parameter to pass one through.
 */
export const assignDefaultRole = (
    userId: string,
    tenantId: string,
    scope: AuthorizationScope = 'tenant'
): Promise<MembershipDocument> => assignRole(userId, tenantId, scope, SIGNUP_DEFAULT_ROLE);

/**
 * Promote an `unverified` membership to `customer` once the address is proven — through the
 * access store, not by assigning a field. A no-op when the membership already holds any OTHER
 * role: verification proves an address, it never overwrites a role an operator already assigned,
 * and it never downgrades one either.
 *
 * @returns whether a promotion actually happened
 */
export const promoteVerifiedCustomer = (userId: string, tenantId: string): Promise<boolean> =>
    membershipIn(userId, tenantId, 'tenant').then((membership) => {
        if (membership?.role !== SIGNUP_DEFAULT_ROLE) {
            return false;
        }

        return assignRole(userId, tenantId, 'tenant', VERIFIED_CUSTOMER_ROLE).then(() => true);
    });

/**
 * Take somebody's role in a place away.
 *
 * Allowed even when it removes a place's last administrator, on purpose: an operator who does that
 * knows what they are doing, and a new administrator is one database write away.
 *
 * @param context - the caller to audit this revoke against, or `undefined` for a system caller
 *   with no request to attribute it to (e.g. the account-deletion cascade in `users/service.ts`'s
 *   `remove`, which has no `CallerContext` to pass — see {@link assignRole}'s own docblock).
 */
export const revokeRole = (
    userId: string,
    tenantId: string | null,
    scope: AuthorizationScope,
    context?: CallerContext
): Promise<void> => {
    // Set once a membership is found, read by BOTH branches below — the failure branch needs it
    // too, so `role` is never missing from its audit row the way it is from the other three (see
    // `auditRoleChange`'s own docblock).
    let revokedRole: string | undefined;

    const attempt = membershipIn(userId, tenantId, scope).then((membership) => {
        if (!membership) {
            return undefined;
        }
        revokedRole = membership.role;

        return membershipRepository.deleteById(membership._id).then(() => membership.role);
    });

    if (!context) return attempt.then(() => undefined);

    return attempt.then(
        (role) => {
            // `role` is `undefined` when there was nothing to revoke — no membership existed, so
            // there is nothing to record.
            if (role) {
                auditRoleChange(
                    context,
                    accessAuditActions.ROLE_REVOKED,
                    'success',
                    userId,
                    role,
                    tenantId,
                    scope
                );
            }
        },
        (error: unknown) => {
            auditRoleChange(
                context,
                accessAuditActions.ROLE_REVOKED,
                'failure',
                userId,
                revokedRole,
                tenantId,
                scope
            );
            throw error;
        }
    );
};

/**
 * The role names that WOULD count as administering a scope — "unrestricted" is no longer one
 * token to match, there is no wildcard, so a role counts when its declared `permissions` array is
 * a SUPERSET of every key this scope currently declares. Computed against
 * `shared/authorization-roles.yaml`, in memory — the preset list is small and fixed for the
 * process's lifetime, so no query is worth it here. {@link administratorsOf} turns this into who
 * actually holds one.
 */
const administratorRoleNames = (scope: AuthorizationScope): string[] => {
    const required = PERMISSION_KEYS.filter((key) => key.scope === scope).map((key) => key.key);
    return PRESET_ROLES.filter(
        (role) => role.scope === scope && required.every((key) => role.permissions.includes(key))
    ).map((role) => role.name);
};

/**
 * Everyone holding an unrestricted role in a place, by user id.
 *
 * The candidate names come from {@link administratorRoleNames}; which userIds actually HOLD one
 * of those names is still the one thing the database answers, since assignment is the data half
 * of this model.
 */
export const administratorsOf = (
    tenantId: string | null,
    scope: AuthorizationScope
): Promise<string[]> => {
    const names = administratorRoleNames(scope);

    return names.length === 0
        ? Promise.resolve([])
        : membershipRepository
              .findByRoles(tenantId, scope, names)
              .then((memberships) => memberships.map((one) => one.userId));
};

/**
 * Take away every role a person holds, in every place — the hard-delete cascade's own half: once
 * the account itself is gone, no membership row may keep pointing at its dead id, a tenant seat OR
 * a platform one. Walks {@link membershipsOf} rather than assuming the single tenant row most
 * callers care about, since a platform operator can hold both at once.
 */
export const revokeAllOf = (userId: string): Promise<void> =>
    membershipsOf(userId).then((memberships) =>
        Promise.all(memberships.map((one) => revokeRole(userId, one.tenantId, one.scope))).then(
            () => undefined
        )
    );

/**
 * The two role names a person holds, and the shop they hold the first one in — `null` for a scope
 * where no membership row exists, which is the honest answer: this person holds no role there.
 *
 * No fallback: a role lives in exactly one place, the membership row. `permissions.ts`'s
 * `keysInScope` already treats a `null` role as "no role", not as a guessed default — the anonymous
 * baseline in tenant scope (signing in may only ever widen what a stranger already sees), an empty
 * set in platform scope. See `docs/theory/authorization.md`.
 */
export const rolesOf = (
    userId: string,
    tenantId: string | null
): Promise<{ tenant: string | null; platform: string | null }> =>
    membershipsOf(userId).then((memberships) => ({
        tenant:
            memberships.find((one) => one.scope === 'tenant' && one.tenantId === tenantId)?.role ??
            null,
        platform: memberships.find((one) => one.scope === 'platform')?.role ?? null
    }));

/**
 * The tenant role for each of a set of people, in one query — the list-page sibling of
 * {@link rolesOf}: a `GET /users` page needs every row's role, and one query per row would be a
 * query per page item. A user id absent from the returned map holds no role here, the same
 * meaning `rolesOf`'s `null` carries for one person.
 */
export const rolesOfMany = (
    userIds: readonly string[],
    tenantId: string | null,
    scope: AuthorizationScope = 'tenant'
): Promise<Map<string, string>> =>
    userIds.length === 0
        ? Promise.resolve(new Map<string, string>())
        : membershipRepository
              .findByUserIds(userIds, tenantId, scope)
              .then(
                  (memberships) =>
                      new Map<string, string>(memberships.map((one) => [one.userId, one.role]))
              );

/**
 * The one shop this boilerplate ships.
 *
 * A single-tenant deployment runs the whole model with one of these and never notices the rest —
 * and a downstream multi-tenant app adds rows without touching the kernel, the guards or the
 * evaluator. That is the point of being tenant-aware before there is a second tenant.
 */
export const DEPLOYMENT_TENANT_SLUG = 'shop';

/**
 * The shop, with no accounts in it — what a fresh deployment needs to boot. The presets need no
 * seeding step: `kernel/permissions.ts` reads them from `shared/authorization-roles.yaml` at
 * import, so they exist the moment the process starts.
 *
 * Idempotent and safe to run against a live database with no `NODE_ENV` guard: the write is an
 * upsert, unlike `scenarios/apply.ts`'s scenario data. `scenarios/accounts.ts`'s `seedAccessModel`
 * is this plus the seed accounts' memberships; `scripts/db/bootstrap-access.ts` is this alone, for a
 * production deploy.
 */
export const bootstrapAccessModel = (name: string): Promise<TenantDocument> =>
    ensureTenant(DEPLOYMENT_TENANT_SLUG, name, DEPLOYMENT_TENANT_ID);
