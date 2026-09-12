/**
 * @module
 * Putting the model into a database that has never seen it: the shop and the preset roles.
 *
 * **Nobody is handed an empty permission matrix.** A deployment gets the roles in
 * `shared/authorization-roles.yaml` on day one and may edit them afterwards — which is the whole
 * difference between "roles are data" and "roles are your problem".
 *
 * Idempotent by construction: every write is an upsert keyed on what makes the row unique, so
 * seeding a database that is already seeded changes nothing and seeding one that is half-seeded
 * finishes the job. A seeder that only works on an empty database is a seeder nobody dares run.
 */

import { ANONYMOUS_ROLE, PRESET_ROLES } from '@kernel/permissions';
import { ensureTenant } from './store';
import { roleModel } from './models';
import type { TenantDocument } from './models';
import { DEMO_TENANT_ID } from './tenant';

export { DEMO_TENANT_ID } from './tenant';

/**
 * The one shop this boilerplate ships.
 *
 * A single-tenant deployment runs the whole model with one of these and never notices the rest —
 * and a downstream multi-tenant app adds rows without touching the kernel, the guards or the
 * evaluator. That is the point of being tenant-aware before there is a second tenant.
 */
export const DEPLOYMENT_TENANT_SLUG = 'shop';

/**
 * Write the preset roles as editable rows.
 *
 * `tenantId: null` marks a role every shop starts with. Editing one changes it everywhere, which
 * is what a preset IS; a shop that wants its own writes a row carrying its own `tenantId`, and
 * `roleFor` prefers that.
 */
export const seedPresetRoles = (): Promise<void> =>
    Promise.all(
        [...PRESET_ROLES, ANONYMOUS_ROLE].map((role) =>
            roleModel
                .findOneAndUpdate(
                    { name: role.name, scope: role.scope, tenantId: null },
                    {
                        $set: { permissions: [...role.permissions], preset: true },
                        $setOnInsert: { name: role.name, scope: role.scope, tenantId: null }
                    },
                    { upsert: true }
                )
                .exec()
        )
    ).then(() => undefined);

/**
 * The shop and the presets, with no accounts in it — what a fresh deployment needs to boot.
 *
 * Idempotent and safe to run against a live database with no `NODE_ENV` guard: every write is an
 * upsert, unlike `scenarios/apply.ts`'s scenario data. `scenarios/accounts.ts`'s `seedAccessModel`
 * is this plus the seed accounts' memberships; `db/bootstrap-access.ts` is this alone, for a
 * production deploy.
 */
export const bootstrapAccessModel = (name: string): Promise<TenantDocument> =>
    seedPresetRoles().then(() => ensureTenant(DEPLOYMENT_TENANT_SLUG, name, DEMO_TENANT_ID));
