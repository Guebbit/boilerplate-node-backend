/**
 * @module
 * Putting the model into a database that has never seen it: the shop, the preset roles, and the
 * demo accounts' memberships.
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
import {
    SEED_OWNER_ID,
    SEED_USER_ID,
    SEED_EDITOR_ID,
    SEED_MODERATOR_ID
} from '@kernel/seed-accounts';
import { assignRole, ensureTenant } from './store';
import { roleModel } from './models';

/**
 * The one shop this boilerplate ships.
 *
 * A single-tenant deployment runs the whole model with one of these and never notices the rest —
 * and a downstream multi-tenant app adds rows without touching the kernel, the guards or the
 * evaluator. That is the point of being tenant-aware before there is a second tenant.
 */
export const DEMO_TENANT_SLUG = 'shop';

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
 * The whole model, seeded: one shop, the presets, and the demo accounts placed in it.
 *
 * `root` is the shop's owner AND the installation's operator — two memberships, because they are
 * two jobs. A request acts as one or the other depending on the key it is asking about, which is
 * exactly the behaviour the platform/tenant split exists to produce, demonstrated by the account
 * everybody logs in as. The two staff accounts each hold exactly one of the newer tenant roles,
 * so each can be logged into and tried on its own — the whole point of adding them to experiment.
 */
export const seedAccessModel = (): Promise<void> =>
    seedPresetRoles()
        .then(() => ensureTenant(DEMO_TENANT_SLUG, 'The Demo Shop'))
        .then((tenant) =>
            Promise.all([
                assignRole(SEED_OWNER_ID, String(tenant._id), 'tenant', 'owner'),
                assignRole(SEED_OWNER_ID, null, 'platform', 'operator'),
                assignRole(SEED_USER_ID, String(tenant._id), 'tenant', 'customer'),
                assignRole(SEED_EDITOR_ID, String(tenant._id), 'tenant', 'editor'),
                assignRole(SEED_MODERATOR_ID, String(tenant._id), 'tenant', 'moderator')
            ])
        )
        .then(() => undefined);
