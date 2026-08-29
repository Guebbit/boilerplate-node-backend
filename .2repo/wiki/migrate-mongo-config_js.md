# migrate-mongo-config.js

## Purpose

Configuration entry point for the [migrate-mongo](https://github.com/seppevk/migrate-mongo) CLI tool. It tells `migrate-mongo` where the migration files live, which collection tracks applied migrations, and how to build the MongoDB connection URI—resolving fragments (`NODE_MONGODB_HOST`, `PORT`, `NAME`) the same way the application does.

## Key elements

- **`DEFAULT_DATABASE_NAME`** – Fallback name (`boilerplate-node-backend`) used when no host/URI env vars are set.
- **`getDatabaseUri()`** – Builds the connection string. Prefers `NODE_DB_URI` if present; otherwise assembles `mongodb://host:port/dbName` from the three fragment variables.
- **`module.exports`** – The object `migrate-mongo` consumes:
  - `mongodb.url` – the resolved URI.
  - `migrationsDir` – path to migration scripts (`db/migrations`).
  - `changelogCollectionName` – Mongo collection that records applied migrations (`migrations_changelog`).
  - `migrationFileExtension` – `.js`.
  - `useFileHash: false` – migrations are identified by filename, not content hash.
  - `moduleSystem: 'commonjs'` – migration files must be CJS (`require`/`module.exports`).

## Relationships

- **`db/migrations/`** – Referenced directly as `migrationsDir`; the directory containing the `.js` migration files that `migrate-mongo` will execute in order.

## Notes

- The URI-resolution logic is a **deliberate duplicate** of `getDatabaseUri()` in `src/infrastructure/bootstrap/database.ts`. It cannot be imported because migrate-mongo loads this file through a plain CommonJS resolver with no TypeScript in the chain. The two implementations are kept in sync by `tests/unit/db/host-scripts.test.ts`, which runs both over the same env matrix and fails on divergence.
- Resolving from **fragments** (host, port, name) rather than only `NODE_DB_URI` is intentional: it lets `npm run host` blank the full URI and override the host alone without the database name being silently locked to the default.
- `useFileHash: false` means renaming a migration file will make it appear as a *new* migration on the next run. Avoid renaming after a migration has been applied.
