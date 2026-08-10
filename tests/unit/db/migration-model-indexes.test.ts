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
 * A schema declaring `unique: true` on a field and a migration creating that same key under a
 * descriptive name of its own is therefore a boot failure on every migrated database, and nowhere
 * else.
 *
 * The rule this enforces: indexes are declared on the schema. One early migration also creates
 * several of them, under the same explicit names, because it has already run against every
 * database — agreement, not competition.
 *
 * The last case is quieter and has nothing to do with migrations: Mongoose copies an embedded
 * schema's indexes onto whatever embeds it, so indexing the catalogue can silently index a frozen
 * product snapshot inside every order too.
 *
 * Deliberately NOT asserted here: that every schema-declared index is also created by a migration.
 * That is a different rule, and this codebase does not follow it — most collections declare their
 * indexes on the schema only, and rely on `autoIndex` to build them. That is a legitimate choice
 * while `autoIndex` is on; it would become a gap the day it is turned off. Failing on it here
 * would assert a policy nobody has adopted.
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
import { orderSchema } from '@models/orders';
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

    it('does not let an embedded schema smuggle its indexes into the parent', async () => {
        /*
         * Mongoose copies a nested schema's indexes onto the schema that embeds it, under a
         * prefixed path. `orderItemSchema` embeds `productSchema`, so an index declared for the
         * catalogue silently becomes an index on `items.product.*` of every order — paid for on
         * each insert, and matching no query anyone makes, because an order item is a frozen
         * snapshot rather than a row of the catalogue. `excludeIndexes` on that path is what
         * stops it; this is the assertion that notices when it is missing.
         */
        const smuggled = orderSchema
            .indexes()
            .map(([key]) => Object.keys(key).join(' + '))
            .filter((paths) => paths.includes('product'));

        expect(smuggled).toEqual([]);
    });

    it('leaves each collection holding exactly the indexes its schema declares', async () => {
        /*
         * The strongest statement available here, and it catches three things at once: an index a
         * migration creates that no schema knows about, a schema declaration that never reaches
         * the database, and a migration that drops an index by a name it does not actually have —
         * which fails silently, because dropping an absent index is deliberately tolerated.
         *
         * Compared by key rather than by name, so it does not depend on how a name was derived.
         */
        await dropAllIndexes();
        await runMigrations();
        await buildModelIndexes();

        const mismatches: string[] = [];
        for (const model of Object.values(mongoose.models)) {
            const declared = new Set<string>(
                model.schema
                    .indexes()
                    .map(([key]: [Record<string, unknown>, unknown]) => JSON.stringify(key))
            );
            const storedIndexes = await model.collection.indexes();
            const stored = new Set<string>(
                storedIndexes
                    .filter((index) => index.name !== '_id_')
                    .map((index) => JSON.stringify(index.key))
            );

            for (const key of stored)
                if (!declared.has(key))
                    mismatches.push(`${model.collection.name}: ${key} stored, declared by nobody`);
            for (const key of declared)
                if (!stored.has(key))
                    mismatches.push(`${model.collection.name}: ${key} declared, never created`);
        }

        expect(mismatches).toEqual([]);
    });
});
