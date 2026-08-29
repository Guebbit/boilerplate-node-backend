# docs/tools/mongodb-mongoose.md

## Purpose

Documents the MongoDB + Mongoose persistence stack for this repo flavor: the role of each tool, the migration workflow (via `migrate-mongo`), and the seed/export architecture that produces a published snapshot of demo data. It exists so a reader can understand the persistence strategy and its invariants without tracing through source files.

## Key elements

- **Tool table** — MongoDB (document DB), Mongoose (schema/model/query layer), `migrate-mongo` (migrations).
- **Persistence flow** — `Service → Repository → Mongoose Model → MongoDB`; repositories own query shape, models own persistence shape.
- **Migrations** — Config in `migrate-mongo-config.js`; migrations live in `db/migrations/` as timestamped `.js` files exporting `up`/`down`. Commands: `db:migrate:up`, `db:migrate:down`, `db:migrate:status`.
- **Index rule** — Indexes may live on the schema, in a migration, or both, but the name and options must match when in both. New indexes belong on the schema; migrations are the only way to drop one or pre-create one on a deployed DB.
- **Seeds** — Split across `factory.ts` (builder), `demo.ts` (records), `kernel/seed-accounts.ts` (shared literals), and `db/demo/demo-data.json` (published output).
- **`seed:export` / `check:seed-export`** — Seeds a `mongodb-memory-server`, reads rows through real serializers, writes the JSON snapshot; the check fails if the committed copy is stale.
- **`_meta.shapes`** — Classifies each published collection as `response` (safe to return as-is) or `stored` (no endpoint serves the row raw). Declared per module beside `seedExport`; missing a classification is a compile error.

## Relationships

- **docs/tools/index.md** — Parent index page for the tools documentation section; links to this file as the MongoDB/Mongoose flavor entry.

## Notes

- **Index name collisions**: Mongoose `autoIndex` is on, so schema indexes are built at boot. If a migration creates the same key under a *different* name, startup throws `Index already exists with a different name` on every migrated database (but not on fresh test DBs). Options (`unique`, `expireAfterSeconds`, partial filters) count as part of identity too.
- **Determinism in seeds**: `createdAt` is pinned from the ObjectId, seed writes pass `{ timestamps: false }`, and the exporter sorts all keys. A value that cannot be pinned must not appear in the dataset.
- **Dangling-reference guard**: Every `*Id` field in `demo-data.json` must reference a record present in the same file; the export refuses to publish otherwise.
- **`_meta.shapes` labels are stated, not derived** — a matcher against generated schemas would mislabel stored collections (e.g. locales parse against the CREATE response shape), so the label is a deliberate human declaration.
- **Test that enforces the index rule**: `tests/unit/db/migration-model-indexes.test.ts` runs migrations and model index builds against one database in both orders and fails on any name/key conflict.
