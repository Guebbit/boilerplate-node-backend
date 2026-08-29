# tests/support/migrations.ts

## Purpose

Shared test-support module that loads the real CommonJS migration files from `db/migrations/` the same way `migrate-mongo` would (disk scan, filename sort, `require`), and exposes helpers to run them against the live test database. It exists so the two migration-focused integration suites have a single, unambiguous definition of "the migration set" rather than each maintaining its own loading logic.

## Key elements

- **`migrations`** — Array of `{ name, module }` objects, one per `.js` file in `db/migrations/`, sorted lexicographically. Each `module` is the `require`-d CommonJS export (expected to have an `up` method).
- **`nativeDb()`** — Returns the underlying MongoDB driver `Db` handle from `mongoose.connection`. Throws if the test connection is not open. Migrations receive this raw handle, not a Mongoose connection, because they predate the application layer.
- **`runMigrations()`** — Iterates `migrations` in order, calling each module's `up(nativeDb())`. No down-migration is performed.

## Relationships

- **`tests/integration/db/migration-demo-data.test.ts`** — Imports `migrations` / `runMigrations` to apply the real migration set, then verifies the published demo dataset survives.
- **`tests/integration/db/migration-model-indexes.test.ts`** — Imports the same helpers to apply migrations, then cross-checks that the indexes they create match the indexes declared in the Mongoose schemas.

## Notes

- Migration files are **CommonJS** (`.js`), so they are loaded via `require` rather than `import`. The `eslint-disable` comment on the `require` call is intentional — this mirrors `migrate-mongo`'s own loading path.
- Sorting is plain lexicographic (`.toSorted()`), matching `migrate-mongo`'s filename-order convention. If a new migration file's name sorts before an existing one, it will run first.
- Only the `up` direction is exposed; there is no `runDown` helper. Tests that need a clean slate should drop/recreate the database rather than calling down-migrations.
- The `MIGRATIONS_DIR` constant resolves relative to `tests/support/`, i.e. two levels up into `db/migrations/`. If the project root layout changes, this path breaks silently (empty `migrations` array) rather than throwing.
