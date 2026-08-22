/**
 * The migration set, loaded the way `migrate-mongo` loads it.
 *
 * Two suites need a database that has actually been migrated — `migration-demo-data.test.ts` asks
 * whether the published dataset survives the migrations, `migration-model-indexes.test.ts` whether
 * the migrations and the schemas agree about indexes — and neither can answer without running the
 * real files. What they share is only the loading: discovery from disk, in filename order, through
 * `require` because the migrations are CommonJS. Everything each suite does with them differs.
 *
 * Stated once here because the two copies could disagree about what "the migrations" are — a
 * filter that stopped matching, or an ordering that stopped being the deployed one, would take
 * both suites green with nothing to run.
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

const MIGRATIONS_DIR = path.join(__dirname, '../../db/migrations');

/** Every migration module, in the order `migrate-mongo` would apply them. */
export const migrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.js'))
    .toSorted()
    .map((file) => ({
        name: file,
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- migrations are CommonJS; require is how migrate-mongo itself loads them
        module: require(path.join(MIGRATIONS_DIR, file)) as {
            up: (db: unknown) => Promise<void>;
        }
    }));

/**
 * The driver-level handle a migration is handed.
 *
 * Migrations take the native `Db`, not a Mongoose connection: they run before the app exists and
 * know nothing about schemas.
 */
export const nativeDb = () => {
    const { db } = mongoose.connection;
    if (!db) throw new Error('no database handle — the test connection is not open');
    return db;
};

/** Apply every migration's `up` against the live test database, as `migrate-mongo` would. */
export const runMigrations = async () => {
    for (const { module } of migrations) await module.up(nativeDb());
};
