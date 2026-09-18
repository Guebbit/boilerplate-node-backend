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

import { Types } from 'mongoose';
import type { AuthorizationScope } from '@types';
import { assertDeclared, findRole, wildcardKeyFor } from '@kernel/permissions';
import { membershipModel, roleModel, tenantModel } from './models';
import type { MembershipDocument, RoleDocument, TenantDocument } from './models';

/** Raised when a write would leave the model in a state the next request cannot recover from. */
export class AccessInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AccessInvariantError';
    }
}

/** One shop by its slug, or `null`. */
export const tenantBySlug = (slug: string): Promise<TenantDocument | null> =>
    tenantModel.findOne({ slug: slug.toLowerCase() }).exec();

/**
 * Create a shop, or return the one already carrying that slug.
 *
 * `id` is optional and only `bootstrapAccessModel` passes one — the fixed `DEPLOYMENT_TENANT_ID` every
 * deployment reads directly, so the row keeps the same id across an `emptyDatabase()` + reseed
 * cycle rather than minting a fresh one. `$setOnInsert` only, same as `slug`/`name` — an existing
 * tenant keeps its id even if a caller passed a different one.
 */
export const ensureTenant = (slug: string, name: string, id?: string): Promise<TenantDocument> =>
    tenantModel
        .findOneAndUpdate(
            { slug: slug.toLowerCase() },
            {
                $setOnInsert: {
                    slug: slug.toLowerCase(),
                    name,
                    ...(id ? { _id: new Types.ObjectId(id) } : {})
                }
            },
            { returnDocument: 'after', upsert: true }
        )
        .exec() as Promise<TenantDocument>;

/**
 * The role a name resolves to in a place: the shop's own first, then the preset every shop has.
 *
 * That order is what "a deployment may edit its roles" means in practice — a shop that redefines
 * `manager` gets its own, and every other shop keeps the preset, with no copy of the preset made
 * anywhere.
 */
export const roleFor = (
    name: string,
    scope: AuthorizationScope,
    tenantId: string | null
): Promise<RoleDocument | null> =>
    roleModel
        .findOne({ name: name.toLowerCase(), scope, tenantId })
        .exec()
        .then(
            (own) =>
                own ?? roleModel.findOne({ name: name.toLowerCase(), scope, tenantId: null }).exec()
        );

/**
 * The keys a membership grants, resolved through the stored role.
 *
 * Falls back to the SHARED preset file when no row exists yet — a deployment that has not seeded
 * still answers correctly, and the conformance suite runs without a database. The database is
 * where a deployment's EDITS live, not where the model's meaning does.
 */
export const permissionsOfMembership = (
    membership: Pick<MembershipDocument, 'role' | 'scope' | 'tenantId'>
): Promise<readonly string[]> =>
    roleFor(membership.role, membership.scope, membership.tenantId).then(
        (stored) => stored?.permissions ?? findRole(membership.role)?.permissions ?? []
    );

/** Every place a person holds a role. One row per place; a person may appear in several. */
export const membershipsOf = (userId: string): Promise<MembershipDocument[]> =>
    membershipModel.find({ userId }).exec();

/** The person's role in one place, or `null` when they are not a member of it. */
export const membershipIn = (
    userId: string,
    tenantId: string | null,
    scope: AuthorizationScope
): Promise<MembershipDocument | null> =>
    membershipModel.findOne({ userId, tenantId, scope }).exec();

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
 */
export const assignRole = (
    userId: string,
    tenantId: string | null,
    scope: AuthorizationScope,
    roleName: string,
    granter?: readonly string[]
): Promise<MembershipDocument> =>
    roleFor(roleName, scope, tenantId).then((stored) => {
        const permissions = stored?.permissions ?? findRole(roleName)?.permissions;

        if (!permissions) {
            throw new AccessInvariantError(
                `[access] "${roleName}" is not a role in this ${scope} scope. ` +
                    `Create it first, or assign one that exists.`
            );
        }

        for (const key of permissions) {
            assertDeclared(key);
        }

        if (granter) {
            const held = new Set(granter);
            const escalated = permissions.filter(
                (key) => !held.has(key) && !held.has(wildcardKeyFor(scope))
            );

            if (escalated.length > 0) {
                throw new AccessInvariantError(
                    `[access] cannot grant "${roleName}": it holds ${escalated.join(', ')}, ` +
                        `which the granter does not. A role editor that allows this is a ` +
                        `privilege-escalation endpoint.`
                );
            }
        }

        return membershipModel
            .findOneAndUpdate(
                { userId, tenantId, scope },
                { $set: { role: roleName.toLowerCase() } },
                { returnDocument: 'after', upsert: true }
            )
            .exec() as Promise<MembershipDocument>;
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
 * change of its own, well past this fix — see the note left in `TIER_AUDIT_BUGS.md`.
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

        return membershipModel
            .deleteOne({ _id: membership._id })
            .exec()
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

        return membershipModel
            .create({
                _id: membership._id,
                userId: membership.userId,
                tenantId: membership.tenantId,
                scope: membership.scope,
                role: membership.role
            })
            .then(() => {
                throw new AccessInvariantError(
                    `[access] "${membership.userId}" is the only member who can administer ` +
                        `this ${scope}. Give somebody else that role first — a place with ` +
                        `nobody to administer it can only be repaired from a database client.`
                );
            });
    });

/** Everyone holding the scope's wildcard in a place, by user id. */
export const administratorsOf = (
    tenantId: string | null,
    scope: AuthorizationScope
): Promise<string[]> => {
    const wildcard = wildcardKeyFor(scope);

    return roleModel
        .find({ scope, permissions: wildcard, $or: [{ tenantId }, { tenantId: null }] })
        .exec()
        .then((roles) => roles.map((role) => role.name))
        .then((names) =>
            names.length === 0
                ? []
                : membershipModel
                      .find({ tenantId, scope, role: { $in: names } })
                      .exec()
                      .then((memberships) => memberships.map((one) => one.userId))
        );
};

/**
 * Delete a role, moving everyone who held it to `reassignTo`.
 *
 * The reassignment is REQUIRED, not defaulted: dropping the holders to no permissions is a silent
 * lockout, and dropping them to a default is a silent grant. Either way the next person to notice
 * is the member who cannot do their job.
 *
 * A preset is refused outright — every shop starts with them, and one shop deleting `manager`
 * would take it from all of them.
 */
export const deleteRole = (
    name: string,
    scope: AuthorizationScope,
    tenantId: string | null,
    reassignTo: string
): Promise<number> =>
    roleFor(name, scope, tenantId).then((role) => {
        if (!role) {
            throw new AccessInvariantError(`[access] there is no "${name}" role to delete.`);
        }

        if (role.preset) {
            throw new AccessInvariantError(
                `[access] "${name}" is a preset every shop starts with. Edit what it holds, or ` +
                    `create a role of your own — deleting it would take it from every other shop.`
            );
        }

        return roleFor(reassignTo, scope, tenantId).then((target) => {
            if (!target) {
                throw new AccessInvariantError(
                    `[access] cannot reassign "${name}"'s members to "${reassignTo}": no such role.`
                );
            }

            return membershipModel
                .updateMany({ role: role.name, scope, tenantId }, { $set: { role: target.name } })
                .exec()
                .then((result) =>
                    roleModel
                        .deleteOne({ _id: role._id })
                        .exec()
                        .then(() => result.modifiedCount)
                );
        });
    });

/**
 * The two role names a person holds, and the shop they hold the first one in.
 *
 * What the auth resolver needs and the only shape it needs: the stored memberships, turned into
 * the two names `AuthContext` carries.
 *
 * `fallback`:  what the ACCOUNT itself says — the `role` column the users module publishes.
 * Precedence:  one-way, **a stored membership always wins**. Without the fallback the kernel would
 *              read the users collection to answer, and the kernel naming a module is the coupling
 *              this layout exists to remove.
 * Never a tie: the two agree wherever both exist, and
 *              `tests/integration/kernel/access.test.ts` refuses to let them drift.
 */
export const rolesOf = (
    userId: string,
    tenantId: string | null,
    fallback: { tenant: string; platform: string | null }
): Promise<{ tenant: string; platform: string | null }> =>
    membershipsOf(userId).then((memberships) => ({
        tenant:
            memberships.find((one) => one.scope === 'tenant' && one.tenantId === tenantId)?.role ??
            fallback.tenant,
        platform: memberships.find((one) => one.scope === 'platform')?.role ?? fallback.platform
    }));
