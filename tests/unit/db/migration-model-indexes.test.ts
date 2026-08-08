/**
 * Migrations and models must agree about indexes.
 *
 * The one state no other suite reproduces: a database that has run BOTH `db/migrations/*.js` and
 * the app's own index creation. Every other test runs against a fresh `mongodb-memory-server` that
 * has never been migrated, so Mongoose creates each schema-declared index unopposed and passes; the
 * migrations, meanwhile, are plain CommonJS that nothing in the suite executes at all. The two only
 * ever meet on a real deployment — dev, staging, production — which is exactly where a
 * disagreement surfaces and exactly where a green CI cannot warn you.
 *
 * What goes wrong. Mongo treats an index's NAME as part of its identity: `createIndex` is a no-op
 * only when name *and* key spec both match what is already stored. Same key under a different name
 * is not "already done", it is `IndexKeySpecsConflict`, and Mongoose surfaces it as
 * "Index already exists with a different name" while building indexes at startup. Same key and
 * name but different options (`unique`, `expireAfterSeconds`, a partial filter) fails the same way.
 * So a schema saying `unique: true` on `userId` (which Mongoose names `userId_1`) and a migration
 * creating `{ userId: 1 }` as `carts_userId` are a boot failure on every migrated database, and
 * nowhere else.
 *
 * The rule this enforces: an index may be declared on the schema, or in a migration, or in both —
 * but if in both, the two must name it identically. See `docs/tools/mongodb-mongoose.md`.
 *
 * Deliberately NOT asserted here: that every schema-declared index is also created by a migration.
 * That is a different rule, and this codebase does not follow it — `feedback-requests` and
 * `audit-logs` declare their indexes on the schema only, and rely on `autoIndex` to build them.
 * That is a legitimate choice while `autoIndex` is on; it would become a gap the day it is turned
 * off. Failing on it here would assert a policy nobody has adopted.
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connect, disconnect } from '../../helpers/database';

/*
 * Importing every model for its side effect: a model registers itself with mongoose on import, and
 * an unregistered one is silently absent from `mongoose.models` — which would make this whole file
 * pass by testing nothing.
 */
import '@models/users';
import '@models/products';
import '@models/orders';
import '@models/carts';
import '@models/feedback-requests';
import '@models/audit-logs';

const MIGRATIONS_DIR = path.join(__dirname, '../../../db/migrations');

/** Every migration module, in the order `migrate-mongo` would apply them. */
const migrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.js'))
    .toSorted()
    .map((file) => ({
        name: file,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        module: require(path.join(MIGRATIONS_DIR, file)) as {
            up: (db: unknown) => Promise<void>;
        }
    }));

const nativeDb = () => {
    const { db } = mongoose.connection;
    if (!db) throw new Error('no database handle — the test connection is not open');
    return db;
};

/** Apply every migration's `up` against the live test database. */
const runMigrations = async () => {
    for (const { module } of migrations) await module.up(nativeDb());
};

/**
 * Build every model's schema-declared indexes, the way a booting app does.
 *
 * `createIndexes()` rather than `init()`: `init()` memoises its promise per model, so once the
 * connection opened and `autoIndex` ran, calling it again resolves from cache and would assert
 * nothing. This re-issues the `createIndex` commands every time.
 */
const buildModelIndexes = () =>
    Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));

/** Wipe every index (except the undroppable `_id_`) so an ordering can be set up from scratch. */
const dropAllIndexes = async () => {
    const collections = await nativeDb().collections();
    for (const collection of collections) await collection.dropIndexes().catch(() => {});
};

beforeAll(connect);
afterAll(disconnect);

describe('migrations and models agree about indexes', () => {
    it('found the migrations, so the assertions below are not vacuous', () => {
        expect(migrations.length).toBeGreaterThan(0);
        expect(Object.keys(mongoose.models).length).toBeGreaterThan(0);
    });

    it('the app can build its indexes on an already-migrated database', async () => {
        // The production ordering, and the one that broke: migrate first, then boot.
        await dropAllIndexes();
        await runMigrations();

        await expect(buildModelIndexes()).resolves.toBeDefined();
    });

    it('the migrations can run against an already-booted database', async () => {
        // The dev ordering: the app created its indexes first, then a migration lands.
        await dropAllIndexes();
        await buildModelIndexes();

        await expect(runMigrations()).resolves.toBeUndefined();
    });

    it('neither half minds being run twice', async () => {
        // Both are meant to be idempotent; a name mismatch usually shows up as a second run
        // failing rather than the first.
        await dropAllIndexes();
        await runMigrations();
        await buildModelIndexes();

        await expect(runMigrations()).resolves.toBeUndefined();
        await expect(buildModelIndexes()).resolves.toBeDefined();
    });

    it('leaves exactly one index per key on every collection', async () => {
        // The subtler failure: no error, but two indexes on the same key under different names,
        // doubling every write's cost for nothing.
        await dropAllIndexes();
        await runMigrations();
        await buildModelIndexes();

        const duplicates: string[] = [];
        for (const collection of await nativeDb().collections()) {
            const seen = new Map<string, string>();
            for (const index of await collection.indexes()) {
                const key = JSON.stringify(index.key);
                const previous = seen.get(key);
                if (previous)
                    duplicates.push(
                        `${collection.collectionName}: ${key} indexed twice — ${previous} and ${String(index.name)}`
                    );
                else seen.set(key, String(index.name));
            }
        }

        expect(duplicates).toEqual([]);
    });
});
