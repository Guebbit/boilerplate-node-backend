/**
 * @module
 * Putting the model into a database that has never seen it: the shop.
 *
 * **Nobody is handed an empty permission matrix.** A deployment gets the roles in
 * `shared/authorization-roles.yaml` on day one, read directly at import — there is no database row
 * to seed any more, since a role's permissions are the same for every deployment.
 *
 * Idempotent by construction: `ensureTenant`'s write is an upsert keyed on the slug, so running
 * this against an already-seeded database changes nothing. A seeder that only works on an empty
 * database is a seeder nobody dares run.
 */

import { ensureTenant } from './store';
import type { TenantDocument } from './models';
import { DEPLOYMENT_TENANT_ID } from './tenant';

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
