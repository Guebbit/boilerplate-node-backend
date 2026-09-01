# docs/tools/mongodb-mongoose.md

## Purpose

Documents the MongoDB + Mongoose persistence stack for this repo: the role of each tool, the migration workflow (migrate-mongo), the index-declaration rule that prevents schema/migration conflicts, and the seed-and-export pipeline that publishes a deterministic `demo-data.json` artefact.

## Key elements

- **Stack table** — MongoDB (document store), Mongoose (schema/model/query layer), migrate-mongo (migrations).
- **Persistence flow** — Service → Repository → Mongoose Model → MongoDB; repositories own query shape, models own persistence shape.
- **`migrate-mongo-config.js`** — root-level config; points at `db/migrations/`, reads `NODE_DB_URI`, tracks applied runs in `migrations_changelog`.
- **Migration commands** — `db:migrate:up`, `db:migrate:down`, `db:migrate:status`.
- **Migration file convention** — each file in `db/migrations/` exports `up(db)` / `down(db)` receiving the raw Mongo driver; named with a timestamp prefix.
- **The index rule** — an index declared on both a schema and a migration must carry the *same name* (and same options). Declare new indexes on the schema; use migrations only to drop or pre-create them. Enforced by `tests/unit/db/migration-model-indexes.test.ts`.
- **Seed runner (`db/demo/index.ts`)** — walks a per-module registry (`demo.ts` / `fixtures.ts`) through the Mongoose repository layer so pre-save hooks fire.
- **`seed:export`** — seeds a throwaway `mongodb-memory-server`, reads rows back through real serializers, writes `db/demo/demo-data.json`. `check:seed-export` fails if the committed copy is stale.
- **Determinism guarantees** — fixtures pin `createdAt` from the ObjectId, seeds pass `{ timestamps: false }`, exporter sorts all keys; dangling `*Id` references are rejected.
- **`_meta.shapes`** — classifies each published collection as `response` (safe to return as-is) or `stored` (requires composed response); declared per-module as `demoShapes`, validated at compile time and by `tests/cross-cutting/seed-conformance.test.ts`.

## Relationships

- **`docs/theory/layers.md`** — the Service → Repository → Model → DB flow described here is the concrete MongoDB instantiation of the layering contract.
- **`docs/modules/products.md`** — `products` appears in the index table (schema + `20240101000000-initial-indexes.js`) and supplies a module-owned `fixtures.ts` / `demo.ts` pair.
- **`docs/modules/audit-logs.md`** — `audit-logs` appears in the index table (schema-only indexes) and contributes a `demo.ts` seed entry.
- **`docs/reference/tests.md`** — `tests/unit/db/migration-model-indexes.test.ts` and `tests/cross-cutting/seed-conformance.test.ts` are the enforcement points for the rules documented here.
- **`docs/tools/package-dependencies.md`** — `mongodb`, `mongoose`, `migrate-mongo`, and `mongodb-memory-server` are the packages whose versions and roles are tracked there.
- **`docs/reference/src-infrastructure.md`** — `db/migrations/`, `migrate-mongo-config.js`, and `db/demo/` live in the infrastructure/DB directory described by that reference page.

## Notes

- `autoIndex` is on in Mongoose, so schema-declared indexes are built at boot. Tests run on `mongodb-memory-server` instances that never execute migrations, which is why the index-name conflict only surfaces on migrated databases — the dedicated test file bridges that gap.
- `seed:export` publishes the *output* (serialized rows), not the input facts. This replaced an earlier shared-facts file that let two independent mappers drift silently.
- `demo-data.json` is regenerated, never hand-edited; `check:seed-export` is the CI guard.
- `_meta.shapes` labels are stated by the module author, not derived by a schema matcher — a wrong label is considered worse than no label because it stops the reader from checking.
- `src/kernel/seed-accounts.ts` holds six shared literals (two account IDs, four credentials) in the kernel rather than as cross-module imports, to avoid three separate registry edges.
