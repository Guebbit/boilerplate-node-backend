# db/migrations/20260822120000-locale-entry-tenant.js

## Purpose

Migration that renames the `scope` field (a two-value enum: `app` / `api`) to `tenant` (a free-form identifier) on the `localemessages` collection, remaps the two legacy values to their demo tenant IDs (`demo-fe`, `demo-be`), swaps the unique index from `(locale, scope, key)` to `(locale, tenant, key)`, and drops the old index. It exists so the locale-entry schema can represent more than one frontend/backend pair per deployment.

## Key elements

- **`TENANT_OF_SCOPE`** — constant mapping `{ app: 'demo-fe', api: 'demo-be' }`; the single source of truth for the value remap, used by both `up` and `down`.
- **`up(db)`** — four ordered steps:
  1. `$rename` `scope → tenant` on rows that still carry `scope` but lack `tenant`.
  2. `$unset` the stale `scope` on rows that already have a `tenant` (prevents clobbering on re-runs).
  3. `$set` the two legacy values to their tenant IDs.
  4. `createIndex` the new unique index, then `dropIndex` the old one (wrapped in try/catch for first-run databases that never had it).
- **`down(db)`** — reverse: maps the two demo IDs back to `app`/`api`, renames `tenant → scope`, recreates the old unique index, drops the new one. Non-demo tenant values are left as-is (no honest mapping exists).

## Relationships

- **`src/modules/locales/model.ts`** — defines the `localeMessages_locale_tenant_key` index in the schema. The index name here *must* match that definition; a mismatch is caught by the test below.
- **`tests/unit/db/migration-model-indexes.test.ts`** — asserts the index names/specs in this migration agree with the model. Disagreement between the two files will fail this test.
- **2026-08-18 backfill migration** (runs before this one) — ensures rows already carry `tenant` before the rename logic executes; the `$exists: false` guard in step 1 depends on that ordering.

## Notes

- **Step order is load-bearing.** The rename and value-mapping must complete *before* `createIndex`, because a Mongo unique index on a missing field indexes every row as `(locale, null, key)` — building it over unrenamed rows would silently permit duplicates on the first real write. The old index is dropped *last* so an interrupted run always leaves the stricter constraint in place.
- **Idempotency is explicit.** Every `updateMany` is guarded by `$exists` predicates so re-running against an already-migrated database is a no-op; both `createIndex` and `dropIndex` calls are safe to repeat (drop is wrapped in try/catch).
- **`down` is lossy for non-demo tenants.** Only `demo-fe`/`demo-be` map back to `app`/`api`; any other tenant value stays as-is in the `scope` column. The old enum validation is the old schema's responsibility, not this file's.
- **Index naming convention.** The index name must be `localeMessages_<field>_key` to match the schema definition in `model.ts`. A typo here won't fail the migration itself but will break the cross-check test.
