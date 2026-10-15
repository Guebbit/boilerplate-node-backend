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

import type { ClientSession } from 'mongoose';
import type { AuthorizationScope, CallerContext, RoleLevel } from '@types';
import { findRole, isBelowLevel, levelOfRoles, PRESET_ROLES } from '@kernel/permissions';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { t } from '@infrastructure/i18n';
import { recordAudit, coreAuditActions } from '@infrastructure/observability/audit';
import type { AuditAction } from '@infrastructure/observability/audit';
import { ConflictError } from '@infrastructure/http/errors';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { ERROR_CODES } from '@api/error-codes';
import { membershipRepository, tenantRepository } from './repository';
import type { MembershipDocument, TenantDocument } from './model';
import { accessAuditActions } from './audit';

/** The `metadata.reason` of a `security.forbidden` row for a refusal because the owner outranks the caller. */
export const OUTRANKED_REASON = 'outranked';

/** The `metadata.reason` of a `security.forbidden` row for a refusal because the thing is the caller's own. */
export const OWN_REASON = 'own';

/**
 * The reasons the shop's own rules write on a `security.forbidden` row — shop business, which the
 * platform operator's incident view leaves out.
 */
export const SHOP_REFUSAL_REASONS: readonly string[] = [OUTRANKED_REASON, OWN_REASON];

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
 *     for every preset, once, rather than this function re-checking it on every grant;
 *   - **granting what the granter does not hold** — otherwise every grant is a
 *     privilege-escalation endpoint, which is the single most common way these systems fail. One
 *     named exception: `CREATE_USER_KEY`'s own docblock.
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
    const permissions = role?.scope === scope ? role.permissions : undefined;

    if (!permissions) {
        return {
            refusal:
                `[access] "${roleName}" is not a role in this ${scope} scope. ` +
                `Declare it in shared/authorization-roles.yaml first, or assign one that exists.`
        };
    }

    if (granter) {
        const held = new Set(granter);
        const escalated = permissions.filter((key) => !held.has(key));

        if (escalated.length > 0) {
            return {
                refusal:
                    `[access] cannot grant "${roleName}": it holds ${escalated.join(', ')}, ` +
                    `which the granter does not. A role editor that allows this is a ` +
                    `privilege-escalation endpoint.`
            };
        }
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
const validateGrant = (
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

/**
 * Record a role grant that has COMMITTED. {@link assignRole} given a `session` audits only its
 * failures, because its success is not true until the caller's transaction commits: the caller
 * calls this after.
 *
 * @param context - the caller to attribute the grant to
 * @param userId - the account that now holds the role
 * @param roleName - the role as the request spelled it
 * @param tenantId - the place the role is held in, `null` for platform scope
 * @param scope - the scope the role was assigned in
 */
export const auditRoleAssigned = (
    context: CallerContext,
    userId: string,
    roleName: string,
    tenantId: string | null,
    scope: AuthorizationScope
): void => {
    auditRoleChange(
        context,
        accessAuditActions.ROLE_ASSIGNED,
        'success',
        userId,
        roleName.toLowerCase(),
        tenantId,
        scope
    );
};

/**
 * Record a role revoke that has COMMITTED — the revoke twin of {@link auditRoleAssigned}.
 *
 * @param context - the caller to attribute the revoke to
 * @param userId - the account that no longer holds the role
 * @param roleName - the role that was taken away
 * @param tenantId - the place the role was held in, `null` for platform scope
 * @param scope - the scope the role was held in
 */
export const auditRoleRevoked = (
    context: CallerContext,
    userId: string,
    roleName: string,
    tenantId: string | null,
    scope: AuthorizationScope
): void => {
    auditRoleChange(
        context,
        accessAuditActions.ROLE_REVOKED,
        'success',
        userId,
        roleName,
        tenantId,
        scope
    );
};

/**
 * One audit row for a role grant or revoke, success or failure — a single shared block instead of
 * {@link assignRole}/{@link revokeRole} each emitting their own near-identical `emitAuditEvent`/
 * `buildAuditEvent` call. Four separate, near-identical blocks are exactly the shape that lets one
 * of them (revoke's failure branch) quietly drop `role` from its metadata while the others keep it.
 *
 * @param userId - `undefined` for a grant refused before the account exists (an admin create)
 * @param role - `undefined` when nothing was there to name (an assign's `roleName` is always
 *   known; a revoke with no membership found, or whose role wasn't yet resolved when it failed,
 *   has none) — omitted from `metadata` rather than sent as `undefined`
 */
const auditRoleChange = (
    context: CallerContext,
    action: AuditAction,
    outcome: 'success' | 'failure',
    userId: string | undefined,
    role: string | undefined,
    tenantId: string | null,
    scope: AuthorizationScope
): void => {
    recordAudit(context, {
        action,
        outcome,
        targetType: 'user',
        targetId: userId,
        metadata: role === undefined ? { tenantId, scope } : { role, tenantId, scope }
    });
};

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
 * Where a person ranks: the higher level of the roles they hold in the shop and over the
 * installation, `user` for someone with no membership at all.
 *
 * Read fresh from the membership rows rather than from a session, because it is asked about the
 * OWNER of a thing — somebody who is not making this request.
 *
 * @param userId - the person asked about
 */
export const levelOfUser = (userId: string): Promise<RoleLevel> =>
    rolesOf(userId, DEPLOYMENT_TENANT_ID).then(levelOfRoles);

/**
 * {@link levelOfUser} for a set of people, in two queries rather than two per person — the
 * batched sibling the inactivity reaper needs to leave staff and administrators alone.
 *
 * @param userIds - the people asked about
 * @returns each id's level; a person with no membership is `user`
 */
export const levelsOfMany = (userIds: readonly string[]): Promise<Map<string, RoleLevel>> =>
    Promise.all([
        rolesOfMany(userIds, DEPLOYMENT_TENANT_ID, 'tenant'),
        rolesOfMany(userIds, null, 'platform')
    ]).then(
        ([tenant, platform]) =>
            new Map(
                userIds.map((id) => [
                    id,
                    levelOfRoles({
                        tenant: tenant.get(id) ?? null,
                        platform: platform.get(id) ?? null
                    })
                ])
            )
    );

/**
 * May this caller change something that belongs to `ownerId`? The rank rule, asked AFTER the
 * route's key: the owner must rank strictly below the caller.
 *
 * Answers yes, without a lookup, for:
 *
 *   - no context at all — self-erasure and the other self-service paths have no caller to rank;
 *   - the system actor — a sweep or the reaper acts for nobody;
 *   - a thing nobody owns, or the caller's OWN thing — the rule is only about other people's.
 *
 * @param context - the caller, or `undefined` for a self-service path with no request behind it
 * @param ownerId - who the account, order, payment, return or key belongs to
 */
export const canActOn = (
    context: CallerContext | undefined,
    ownerId: string | null | undefined
): Promise<boolean> => {
    if (!context || context.caller.system || !ownerId || context.caller.id === ownerId) {
        return Promise.resolve(true);
    }

    return levelOfUser(ownerId).then((ownerLevel) =>
        isBelowLevel(ownerLevel, context.caller.level)
    );
};

/**
 * {@link canActOn} as a refusal a service can return: `undefined` to carry on, or the
 * `403 OUTRANKED` envelope — recorded as a failed `security.forbidden` first, so an attempt on an
 * equal or a superior leaves a row naming who tried what to whom.
 *
 * @param context - the caller, or `undefined` for a self-service path
 * @param ownerId - who the thing belongs to
 * @param targetType - the audit row's object, e.g. `order`
 * @param targetId - the audit row's object id, when it is not the owner's own
 */
export const outrankedRefusal = (
    context: CallerContext | undefined,
    ownerId: string | null | undefined,
    targetType: string,
    targetId: string | undefined = ownerId ?? undefined
): Promise<ResponseReject | undefined> =>
    canActOn(context, ownerId).then((allowed) => {
        if (allowed || !context) return undefined;

        recordAudit(context, {
            action: coreAuditActions.SECURITY_FORBIDDEN,
            outcome: 'failure',
            targetType: targetType,
            targetId: targetId,
            metadata: { reason: OUTRANKED_REASON, ownerId }
        });

        return generateReject(403, [
            { code: ERROR_CODES.OUTRANKED, message: t('generic.error-outranked') }
        ]);
    });

/**
 * Does `ownerId` name the caller themselves? The question behind "nobody handles their own
 * money" — no context, the system actor and a thing nobody owns are never the caller's own.
 *
 * @param context - the caller, or `undefined` for a path with no request behind it
 * @param ownerId - who the order, payment or return belongs to
 */
export const isOwnThing = (
    context: CallerContext | undefined,
    ownerId: string | null | undefined
): boolean =>
    context !== undefined &&
    !context.caller.system &&
    Boolean(ownerId) &&
    context.caller.id === ownerId;

/**
 * The two-part refusal for a step that moves money: the caller may not be the owner (separation
 * of duties — a person never pays, refunds or approves their own), and the owner must rank below
 * the caller like any other write ({@link outrankedRefusal}).
 *
 * The own-thing refusal is a plain `403 FORBIDDEN` with its own message, never `OUTRANKED`: that
 * code's contract text makes the caller's own thing the exception. It is recorded as a failed
 * `security.forbidden` with `reason: 'own'`; the owner is the caller, so no `ownerId` rides along.
 *
 * See: docs/theory/authorization.md#nobody-handles-their-own-money
 * @param context - the caller, or `undefined` for a path with no request behind it
 * @param ownerId - who the thing belongs to
 * @param targetType - the audit row's object, e.g. `order`
 * @param targetId - the audit row's object id, when it is not the owner's own
 */
export const ownMoneyRefusal = (
    context: CallerContext | undefined,
    ownerId: string | null | undefined,
    targetType: string,
    targetId: string | undefined = ownerId ?? undefined
): Promise<ResponseReject | undefined> => {
    if (!context || !isOwnThing(context, ownerId))
        return outrankedRefusal(context, ownerId, targetType, targetId);

    recordAudit(context, {
        action: coreAuditActions.SECURITY_FORBIDDEN,
        outcome: 'failure',
        targetType: targetType,
        targetId: targetId,
        metadata: { reason: OWN_REASON }
    });

    return Promise.resolve(
        generateReject(403, [
            { code: ERROR_CODES.FORBIDDEN, message: t('generic.error-own-money') }
        ])
    );
};

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
