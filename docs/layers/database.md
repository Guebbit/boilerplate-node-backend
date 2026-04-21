# Database

## Connection

`src/utils/database.ts` exports a `start()` function that connects Mongoose to MongoDB. It uses exponential backoff — up to 10 retries with a maximum delay of 30 s — so the app recovers automatically from transient network failures at startup.

The connection URI is read from the `NODE_DB_URI` environment variable.

## Migrations

Migrations are managed by [migrate-mongo](https://github.com/seppevs/migrate-mongo). The CLI is executed through a TypeScript runtime (`tsx`) so migrations in `db/migrations/` can import shared TypeScript helpers safely.

```bash
npm run db:migrate         # apply pending migrations
npm run db:migrate:down    # roll back the last migration
npm run db:migrate:status  # list applied / pending migrations
```

Applied migrations are tracked in a `migrations_changelog` collection in MongoDB.

### Writing a migration

```ts
// db/migrations/20240101000001-add-index.ts
export const up = async (db) => {
    await db.collection('products').createIndex({ title: 'text' });
};

export const down = async (db) => {
    await db.collection('products').dropIndex('title_text');
};
```

Use migration-safe helpers from `src/migrations/` to share domain/database logic. Avoid importing app bootstrap/runtime modules (for example `src/app.ts`) inside migrations.

## Seeds

`db/seeds/index.ts` inserts baseline data using the repository layer (not raw queries), so seeds respect the same validation and defaults as the application.

```bash
npm run db:seed            # insert seed data
npm run db:seed:reset      # drop the database, then re-seed
```

The `--reset` flag drops the entire database before seeding, useful to return to a known state during development.
