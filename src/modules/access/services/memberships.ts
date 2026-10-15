/**
 * @module
 * The membership half of the model: tenants, who holds which role in which place, and the writes
 * that change it. A role lives in exactly one place, the membership row — the user document holds
 * none of its own.
 *
 * See: docs/theory/authorization.md
 */

import type { ClientSession } from 'mongoose';
import type { AuthorizationScope, CallerContext } from '@types';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { membershipRepository, tenantRepository } from '../repository';
import type { MembershipDocument, TenantDocument } from '../model';
import { accessAuditActions } from '../audit';
import { validateGrant } from './grants';
import { auditRoleAssigned, auditRoleChange, auditRoleRevoked } from './role-audit';

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
 * Give somebody a role in a place. See {@link validateGrant} for what this refuses.
 *
 * @param granter - the keys the person MAKING the grant holds, or `undefined` for a seeder, a
 *   migration or an operator on the console — the three callers with nobody to escalate from
 * @param context - the caller context to audit this grant (or its refusal) against. `undefined`
 *   for a seeder or system caller with no request to attribute it to. An
 *   escalation attempt is audited as a FAILURE, not skipped: it is the single most useful entry
 *   this vocabulary can produce.
 * @param session - the caller's transaction, when the grant must commit or roll back with other
 *   writes. Given one, only failures are audited here; the caller records the success with
 *   {@link auditRoleAssigned} once it has committed.
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
    context?: CallerContext,
    session?: ClientSession
): Promise<MembershipDocument> => {
    const attempt = Promise.resolve()
        .then(() => validateGrant(scope, roleName, granter))
        .then((lowered) =>
            membershipRepository.upsertRole(userId, tenantId, scope, lowered, session)
        );

    if (!context) return attempt;

    return attempt.then(
        (membership) => {
            if (!session) auditRoleAssigned(context, userId, roleName, tenantId, scope);
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
 * Take somebody's role in a place away.
 *
 * Allowed even when it removes a place's last administrator, on purpose: an operator who does that
 * knows what they are doing, and a new administrator is one database write away.
 *
 * @param context - the caller to audit this revoke against, or `undefined` for a system caller
 *   with no request to attribute it to (e.g. the account-deletion cascade in `users/services/remove.ts`'s
 *   `remove`, which has no `CallerContext` to pass — see {@link assignRole}'s own docblock).
 * @param session - the caller's transaction, when the revoke must commit or roll back with other
 *   writes. Given one, only failures are audited here; the caller records the success with
 *   {@link auditRoleRevoked} once it has committed.
 */
export const revokeRole = (
    userId: string,
    tenantId: string | null,
    scope: AuthorizationScope,
    context?: CallerContext,
    session?: ClientSession
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

        return membershipRepository.deleteById(membership._id, session).then(() => membership.role);
    });

    if (!context) return attempt.then(() => undefined);

    return attempt.then(
        (role) => {
            // `role` is `undefined` when there was nothing to revoke — no membership existed, so
            // there is nothing to record.
            if (role && !session) {
                auditRoleRevoked(context, userId, role, tenantId, scope);
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
 * Take away every role a person holds, in every place, one revoke at a time. Walks
 * {@link membershipsOf} rather than assuming the single tenant row most callers care about, since
 * a platform operator can hold both at once. A hard delete does not use it: it erases through
 * {@link eraseMemberships}, inside its own transaction.
 */
export const revokeAllOf = (userId: string): Promise<void> =>
    membershipsOf(userId).then((memberships) =>
        Promise.all(memberships.map((one) => revokeRole(userId, one.tenantId, one.scope))).then(
            () => undefined
        )
    );

/**
 * The `personalData.erase` hook of this module's `roles` section: every role the person holds,
 * in every place, goes in the same transaction as the account itself. Once the account is gone no
 * membership row may keep pointing at its dead id, a tenant seat OR a platform one; and because it
 * rides the cascade, a failed erasure takes no role away from an account that stays.
 *
 * Allowed even when it removes a place's last administrator, like {@link revokeRole}.
 *
 * @param userId - the erased account
 * @param session - the hard delete's transaction; every write here must take it
 */
export const eraseMemberships = (userId: string, session: ClientSession): Promise<void> =>
    membershipRepository.deleteByUserId(userId, session).then(() => undefined);

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
