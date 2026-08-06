require('dotenv').config();

/**
 * Fallback database name when only host/port are configured.
 * Mirrors `DEFAULT_DATABASE_NAME` in `src/core/bootstrap/database.ts`.
 */
const DEFAULT_DATABASE_NAME = 'boilerplate-node-backend';

/**
 * Resolve the Mongo URI exactly as the application does.
 *
 * This duplicates `getDatabaseUri()` from `src/core/bootstrap/database.ts` because it cannot
 * import it: migrate-mongo loads this file through its own CommonJS resolver, with no TypeScript
 * in the chain. The duplication is deliberate and pinned — `tests/unit/db/host-scripts.test.ts`
 * runs both implementations over the same env matrix and fails if they ever disagree.
 *
 * Reading only `NODE_DB_URI`, as this file used to, is what made the `:host` scripts dangerous:
 * they had to spell out a full URI to make migrations work, that URI hardcoded the database name,
 * and so `db:migrate:*:host` and `db:seed:host` silently targeted `boilerplate-node-backend` no
 * matter what `NODE_MONGODB_NAME` said. Honouring the fragments lets those scripts blank the URI
 * and override the host alone.
 */
const getDatabaseUri = () => {
    if (process.env.NODE_DB_URI) return process.env.NODE_DB_URI;

    const host = process.env.NODE_MONGODB_HOST ?? '127.0.0.1';
    const port = process.env.NODE_MONGODB_PORT ?? '27017';
    const databaseName = process.env.NODE_MONGODB_NAME ?? DEFAULT_DATABASE_NAME;
    return `mongodb://${host}:${port}/${databaseName}`;
};

module.exports = {
    mongodb: {
        url: getDatabaseUri()
    },
    migrationsDir: 'db/migrations',
    changelogCollectionName: 'migrations_changelog',
    migrationFileExtension: '.js',
    useFileHash: false,
    moduleSystem: 'commonjs'
};
