# docs/reference/data.md

## Purpose

Reference page documenting the `db/` directory: the split between **schema ownership** (migrations via `migrate-mongo`) and **data ownership** (seeding via per-module fixtures), plus the supporting tools for cache clearing and one-shot scripts. It exists so a reader can orient in the database layer without opening each file.

## Key elements

- **`db/migrations/*.js`** – One file per schema change, timestamp-prefixed, each exporting `up`/`down`. Plain JS (CommonJS) because `migrate-mongo`'s resolver is not TypeScript-aware. Run with `npm run db:migrate:up`.
- **`db/demo/index.ts`** – The seeder entry point (`npm run db:seed`). Iterates enabled modules' seed files, upserts fixtures idempotently via a shared primitive. A reset flag can empty collections first.
- **`db/demo/assemble.ts`** – Re-reads seeded rows through the real API serializers and writes the result to `demo-data.json`, so the published dataset reflects API output, not raw storage.
- **`db/demo/demo-data.json`** – Generated artifact (`npm run seed:export`); the canonical mock dataset for the paired frontend. `npm run check:seed-export` guards it; Prettier is excluded so the generator is the sole writer.
- **`db/cache-clear.ts`** – Drops all app-owned cached responses (`npm run db:cache:clear`); intended for writes the API did not handle (migrations, manual edits, restored dumps).
- **`db/run-script.ts`** – Shared entry-point wrapper for one-shot scripts: opens/closes a DB connection, exits non-zero on failure, and prints the error instead of leaving an unhandled rejection.
- **Guard tests** – `tests/unit/db/migration-model-indexes.test.ts` (indexes in migrations vs. models) and `tests/unit/db/migration-demo-data.test.ts` (migration vs. seeded dataset compatibility).

## Relationships

- **`db/demo/index.ts`** – The concrete seeder this page describes. It is the file `npm run db:seed` invokes; the page explains *why* it is shaped that way (per-module fixtures, idempotent upsert, disabled-module skip).
- **`db/migrations/`** – The schema-change directory this page documents. The page clarifies the contract boundary: migrations change collection shape, seeds fill rows, and the two are never mixed.
- **`docs/reference/index.md`** – The parent reference index that links to this page under the database/data section.

## Notes

- Migrations and `migrate-mongo-config.js` are intentionally `.js` (not `.ts`)—`migrate-mongo` loads them through its own CommonJS resolver with no TypeScript step. Do not convert.
- Fixtures are **not** in `db/`; each module owns its own slice. The two demo accounts live in `src/kernel/seed-accounts.ts`.
- `demo-data.json` is a generated file. Do not hand-edit; Prettier is excluded so the two writers (generator vs. formatter) cannot conflict.
- The API invalidates its own cache on writes it handles; `db/cache-clear.ts` exists only for the writes it does **not** handle.
