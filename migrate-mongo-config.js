require('dotenv').config();

/**
 * Fallback database name when only host/port are configured.
 * Mirrors `DEFAULT_DATABASE_NAME` in `src/infrastructure/bootstrap/database.ts`.
 */
const DEFAULT_DATABASE_NAME = 'boilerplate-node-backend';

/**
 * Resolve the Mongo URI exactly as the application does.
 *
 * This duplicates `getDatabaseUri()` from `src/infrastructure/bootstrap/database.ts` because it cannot
 * import it: migrate-mongo loads this file through its own CommonJS resolver, with no TypeScript
 * in the chain. The duplication is deliberate and pinned — `tests/unit/db/host-scripts.test.ts`
 * runs both implementations over the same env matrix and fails if they ever disagree.
 *
 * Reading the host/port/name fragments and not only `NODE_DB_URI` is what makes `npm run host`
 * safe: a full URI hardcodes the database name, so it would silently target
 * `boilerplate-node-backend` whatever `NODE_MONGODB_NAME` said. Honouring the fragments lets
 * it blank the URI and override the host alone.
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
