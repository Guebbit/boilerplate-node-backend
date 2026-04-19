# Database

## Connection

`src/utils/database.ts` exports a `start()` function that connects Mongoose to MongoDB. It uses exponential backoff — up to 10 retries with a maximum delay of 30 s — so the app recovers automatically from transient network failures at startup.

The connection URI is read from the `NODE_DB_URI` environment variable.

## Migrations

Migrations are managed by [migrate-mongo](https://github.com/seppevs/migrate-mongo). Each migration is a JS file in `db/migrations/` that exports `up` and `down` functions.

```bash
npm run db:migrate         # apply pending migrations
npm run db:migrate:down    # roll back the last migration
npm run db:migrate:status  # list applied / pending migrations
```

Applied migrations are tracked in a `migrations_changelog` collection in MongoDB.

### Writing a migration

```js
// db/migrations/20240101000001-add-index.js
export async function up(db) {
    await db.collection('products').createIndex({ title: 'text' });
}

export async function down(db) {
    await db.collection('products').dropIndex('title_text');
}
```

## Seeds

`db/seeds/index.ts` inserts baseline data using the repository layer (not raw queries), so seeds respect the same validation and defaults as the application.

```bash
npm run db:seed            # insert seed data
npm run db:seed:reset      # drop the database, then re-seed
```

The `--reset` flag drops the entire database before seeding, useful to return to a known state during development.
