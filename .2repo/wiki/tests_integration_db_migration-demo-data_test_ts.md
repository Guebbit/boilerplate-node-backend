# tests/integration/db/migration-demo-data.test.ts

## Purpose

Integration test that asserts the demo dataset artefact (`db/demo/demo-data.json`) is identical whether migrations run before seeding, after seeding, or are replayed a second time. It closes the one gap no other gate covers: a migration silently rewriting seeded rows (e.g. `imageUrl`) into a shape the published artefact does not reflect, while schema checks and self-referential comparisons stay green.

## Key elements

- **`runSeeders()`** — calls each module's `seeds` from `enabledModules` via `Promise.all`, mirroring the write-path in `db/demo/index.ts` without the runner's connection/gate/cache concerns.
- **`wipeRows()`** — `deleteMany({})` on every collection in `nativeDb()`, preserving indexes so repeated cases see the same schema.
- **`committedArtefact()`** — reads the committed `DEMO_DATA_PATH` file as a UTF-8 string.
- **Sanity test** — guards against vacuous passes by asserting at least one migration and at least one seeder exist.
- **`migrate → seed` test** — fresh-install ordering (`db:bootstrap`); asserts assembled output equals the committed artefact.
- **`seed → migrate` test** — long-lived-database ordering; the case most likely to drift.
- **`seed → migrate → migrate` test** — idempotency guard: a non-idempotent rewrite corrupts only on the second pass.

## Relationships

- **`db/demo/assemble.ts`** — provides `assembleDemoDataset()` (serializes the live DB into the artefact shape) and `DEMO_DATA_PATH`. Imported so the test serializes rows through the same code the publish pipeline uses, eliminating two-walk drift.
- **`src/modules.ts`** — provides `enabledModules`; the test iterates this manifest to invoke seeders, so a new module is picked up without editing the test.
- **`tests/support/database.ts`** — provides `connect()` / `disconnect()` for the `beforeAll` / `afterAll` lifecycle.
- **`tests/support/migrations.ts`** — provides `runMigrations()`, `nativeDb()` (used by `wipeRows`), and `migrations` (used in the sanity assertion).

## Notes

- The assertion is a **whole-document structural equality** (`toEqual` against the committed file), not a list of expected fields. The failure mode this test targets is a migration touching a field nobody predicted; a property checklist would miss it. Jest's diff output still identifies the moved key.
- **Deliberately not tested:** migrations on an *unseeded* database. Most of the twelve migrations rewrite rows the seeders produce; without those rows there is nothing for the migration to act on, so the test would pass trivially and prove nothing.
- `wipeRows` uses `deleteMany` rather than dropping collections because several migrations create indexes on first run; dropping would remove those indexes and cause later test cases to fail for an unrelated reason.
- The test relies on `migrate-mongo`'s internal tracking for the double-migrate case, but the third test explicitly replays to catch non-idempotent rewrites that tracking would normally prevent.
