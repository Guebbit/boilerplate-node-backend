/**
 * @module
 * Reading and writing the authorization model — and refusing the writes that would leave it in a
 * state nobody can recover from.
 *
 * Every rule below is one somebody learned the expensive way, and each is a REFUSAL rather than a
 * note in a docblock. A model whose invariants are documented is a model whose invariants drift:
 * the check that is not executed is the check that is not true.
 *
 * See: docs/theory/authorization.md · `shared/authorization-roles.yaml`
 */

import type { AuthorizationScope } from '@types';
import { assertDeclared, findRole, PERMISSION_KEYS, PRESET_ROLES } from '@kernel/permissions';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { membershipRepository, tenantRepository } from './repository';
import type { MembershipDocument, TenantDocument } from './model';

/** The one role self-service signup (or an OAuth signup a provider already vouches for) may ever
 * grant — never a caller-supplied name. See {@link assignDefaultRole}. */
const SIGNUP_DEFAULT_ROLE = 'unverified';

/** What `unverified` promotes to once the address is proven. See {@link promoteVerifiedCustomer}. */
const VERIFIED_CUSTOMER_ROLE = 'customer';

/** Raised when a write would leave the model in a state the next request cannot recover from. */
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
 * Give somebody a role in a place.
 *
 * Refuses three things, and each refusal is an invariant of the model:
 *
 *   - **a role nothing declares** — assigning a name no row and no preset defines produces a
 *     member who can do nothing and looks like a member who can;
 *   - **a key no module owns** — checked through the role's own keys, because a role editor that
 *     accepts a free-text key is a permission system with no vocabulary;
 *   - **granting what the granter does not hold** — otherwise every role editor is a
 *     privilege-escalation endpoint, which is the single most common way these systems fail.
 *
 * @param granter - the keys the person MAKING the grant holds, or `undefined` for a seeder, a
 *   migration or an operator on the console — the three callers with nobody to escalate from
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
    granter?: readonly string[]
): Promise<MembershipDocument> =>
    Promise.resolve().then(() => {
        const lowered = roleName.toLowerCase();
        const role = findRole(lowered);
        const permissions = role?.scope === scope ? role.permissions : undefined;

        if (!permissions) {
            throw new AccessInvariantError(
                `[access] "${roleName}" is not a role in this ${scope} scope. ` +
                    `Declare it in shared/authorization-roles.yaml first, or assign one that exists.`
            );
        }

        for (const key of permissions) {
            assertDeclared(key);
        }

        if (granter) {
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

        return membershipRepository.upsertRole(userId, tenantId, scope, lowered);
    });

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
 * Refuses to leave nobody who can administer it: without this a shop becomes unadministrable and
 * only somebody with a database client can put it right.
 *
 * Deletes first, then checks — not a transaction. A session transaction would close the race
 * outright, but it needs a replica set, and only the production compose profile has one
 * (`docker/mongo-rs-init.sh`); local dev (`docker-compose.yml`) and the test gate
 * (`docker-compose.test.yml` and the in-process `mongod` under jest) both run standalone Mongo,
 * where opening a session throws. Wiring replica-set support into dev and test infrastructure is a
 * change of its own, well past this fix.
 *
 * The delete is awaited now (it was fired with `void` before), so a rejection reaches the caller's
 * `.catch` instead of vanishing behind an orphaned membership row. And the delete happening FIRST,
 * checked after, is what {@link restoreIfNowUnadministered} exists for: it puts the row back and
 * throws the same refusal a pre-delete check would have, if the delete just emptied the
 * administrator set. Two concurrent revokes of the last two administrators can still both delete
 * before either checks — both then see zero, both restore their own row, and BOTH calls end in the
 * same refusal, which is the weaker but still-safe guarantee this shape buys without a transaction:
 * the set is never left with nobody who can administer it, even though a genuine tie over-refuses
 * rather than letting one revoke through.
 */
export const revokeRole = (
    userId: string,
    tenantId: string | null,
    scope: AuthorizationScope
): Promise<void> =>
    membershipIn(userId, tenantId, scope).then((membership) => {
        if (!membership) {
            return;
        }

        return membershipRepository
            .deleteById(membership._id)
            .then(() => restoreIfNowUnadministered(tenantId, scope, membership));
    });

/**
 * Puts a just-deleted membership back and refuses, if deleting it left nobody who can administer
 * this place — see {@link revokeRole} for why this runs AFTER the delete rather than before it.
 *
 * @param membership - the row {@link revokeRole} already deleted
 * @throws AccessInvariantError when the place is now left with no administrator
 */
const restoreIfNowUnadministered = (
    tenantId: string | null,
    scope: AuthorizationScope,
    membership: MembershipDocument
): Promise<void> =>
    administratorsOf(tenantId, scope).then((administrators) => {
        if (administrators.length > 0) {
            return;
        }

        return membershipRepository.restore(membership).then(() => {
            throw new AccessInvariantError(
                `[access] "${membership.userId}" is the only member who can administer ` +
                    `this ${scope}. Give somebody else that role first — a place with ` +
                    `nobody to administer it can only be repaired from a database client.`
            );
        });
    });

/**
 * Everyone holding an unrestricted role in a place, by user id.
 *
 * "Unrestricted" is no longer one token to match — there is no wildcard — so a role counts when
 * its declared `permissions` array is a SUPERSET of every key this scope currently declares.
 * The candidate names are computed against `shared/authorization-roles.yaml` (in memory — the
 * preset list is small and fixed for the process lifetime, so no query is worth it there); which
 * userIds actually HOLD one of those names is still the one thing the database answers, since
 * assignment is the data half of this model.
 */
export const administratorsOf = (
    tenantId: string | null,
    scope: AuthorizationScope
): Promise<string[]> => {
    const required = PERMISSION_KEYS.filter((key) => key.scope === scope).map((key) => key.key);
    const names = PRESET_ROLES.filter(
        (role) => role.scope === scope && required.every((key) => role.permissions.includes(key))
    ).map((role) => role.name);

    return names.length === 0
        ? Promise.resolve([])
        : membershipRepository
              .findByRoles(tenantId, scope, names)
              .then((memberships) => memberships.map((one) => one.userId));
};

/**
 * The two role names a person holds, and the shop they hold the first one in — `null` for a scope
 * where no membership row exists, which is the honest answer: this person holds no role there.
 *
 * No fallback any more: a role lives in exactly one place, the membership row. `permissions.ts`'s
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
 * is this plus the seed accounts' memberships; `db/bootstrap-access.ts` is this alone, for a
 * production deploy.
 */
export const bootstrapAccessModel = (name: string): Promise<TenantDocument> =>
    ensureTenant(DEPLOYMENT_TENANT_SLUG, name, DEPLOYMENT_TENANT_ID);
