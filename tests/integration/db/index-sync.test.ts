/**
 * `db:sync` is the only thing that shapes the database, so it has to be exactly right.
 *
 * Every other suite runs against a fresh `mongodb-memory-server` where Mongoose's `autoIndex`
 * builds each schema-declared index unopposed — which means no other suite ever observes a
 * database whose stored indexes DISAGREE with the schemas. That state is the normal one on a real
 * deployment: an index was declared and the deploy has not run yet, or one was deleted from a
 * schema and is still sitting in the collection. This file constructs both and asserts the
 * reconciliation resolves them.
 *
 * What it no longer needs to test: that two authors of an index agree. There is one author.
 * `model.ts` declares an index and `syncIndexes` makes it so — the class of bug where a
 * hand-written migration created the same key under a different name, and broke every boot on an
 * already-migrated database, cannot be expressed in this design.
 *
 * The one case worth keeping from that era is the exact-agreement assertion: Mongoose copies an
 * EMBEDDED schema's indexes onto whatever embeds it, so indexing the catalogue can silently index
 * a frozen product snapshot inside every order too. That is a schema-authoring mistake rather
 * than a migration one, and it still shows up here as an index nobody meant to declare.
 *
 * See: docs/reference/data.md
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connect, disconnect } from '@tests/database';
import { applyIndexSync, findBlockingDuplicates, planIndexSync } from '../../../db/index-sync';
import { enabledModules } from '../../../src/modules';

/** Where the canary below looks for the models the registry should have brought in. */
const MODULES_ROOT = path.join(__dirname, '../../../src/modules');

/** The native handle, for the states only the driver can construct. */
const nativeDb = () => {
    const { db } = mongoose.connection;
    if (!db) throw new Error('no database handle — the test connection is not open');
    return db;
};

/** Wipe every index (except the undroppable `_id_`) so a starting state can be set up by hand. */
const dropAllIndexes = async () => {
    for (const collection of await nativeDb().collections())
        await collection.dropIndexes().catch(() => {});
};

/**
 * The parts of a registered model these cases read.
 *
 * Declared rather than imported for the same reason `db/index-sync.ts` declares one:
 * `mongoose.models` is a map of `Model<any>`, and reading through it would launder an `any` into
 * every assertion below.
 */
interface RegisteredModel {
    collection: {
        name: string;
        indexes: () => Promise<{ name?: string; key: Record<string, unknown> }[]>;
    };
    schema: { indexes: () => [Record<string, unknown>, Record<string, unknown>][] };
}

/** Every index actually stored for a model, by key spec, `_id_` excluded. */
const storedKeys = async (model: RegisteredModel): Promise<Set<string>> => {
    const indexes = await model.collection.indexes();
    return new Set(
        indexes.filter((index) => index.name !== '_id_').map((index) => JSON.stringify(index.key))
    );
};

/** Every index a model's schema declares, by key spec. */
const declaredKeys = (model: RegisteredModel): Set<string> =>
    new Set(model.schema.indexes().map(([key]) => JSON.stringify(key)));

/** Every model the registry brought in, narrowed once so the cases below stay typed. */
const models = (): RegisteredModel[] => Object.values(mongoose.models);

beforeAll(connect);
afterAll(disconnect);

describe('db:sync', () => {
    it('registered a model from every enabled module that ships one', () => {
        /*
         * The canary for the registry walk, and the reason every assertion below means something.
         * `db/index-sync.ts` registers models by importing `enabledModules` and relying on each
         * `module.ts` to reach its own `model.ts`. A module that stopped doing so would drop out
         * silently: every case here would still pass, over one model fewer, and that domain's
         * indexes would quietly stop being built in production.
         *
         * Counted against the DISK rather than a literal. "Fourteen modules own a collection" is a
         * copy of `src/modules.ts` written as an integer, and it goes stale on the commit that
         * adds a domain rather than on the commit that breaks the walk.
         */
        const enabledNames = new Set(enabledModules.map(({ name }) => name));
        const owningACollection = fs
            .readdirSync(MODULES_ROOT)
            .filter((name) => enabledNames.has(name))
            .filter((name) => fs.existsSync(path.join(MODULES_ROOT, name, 'model.ts')));

        expect(owningACollection.length).toBeGreaterThan(0);
        expect(models().length).toBeGreaterThanOrEqual(owningACollection.length);
    });

    it('builds every index the schemas declare, from nothing', async () => {
        // The fresh-database case: `db:bootstrap` against an empty volume.
        await dropAllIndexes();
        await applyIndexSync();

        const missing: string[] = [];
        for (const model of models()) {
            const stored = await storedKeys(model);
            for (const key of declaredKeys(model))
                if (!stored.has(key)) missing.push(`${model.collection.name}: ${key}`);
        }

        expect(missing).toEqual([]);
    });

    it('leaves each collection holding EXACTLY what its schema declares', async () => {
        /*
         * The strongest statement available, and the reason `syncIndexes` was chosen over
         * `createIndexes`: an index nobody declares is drift, and drift that only accumulates is
         * how a collection ends up carrying indexes whose purpose no one can reconstruct.
         *
         * Compared by key rather than by name, so it does not depend on how a name was derived.
         */
        await dropAllIndexes();
        await applyIndexSync();

        const mismatches: string[] = [];
        for (const model of models()) {
            const declared = declaredKeys(model);
            const stored = await storedKeys(model);

            for (const key of stored)
                if (!declared.has(key))
                    mismatches.push(`${model.collection.name}: ${key} stored, declared by nobody`);
            for (const key of declared)
                if (!stored.has(key))
                    mismatches.push(`${model.collection.name}: ${key} declared, never created`);
        }

        expect(mismatches).toEqual([]);
    });

    it('drops an index no schema declares', async () => {
        // Drift, constructed: an index created by hand, or left behind by a schema that has since
        // stopped declaring it. Nothing else in the suite can produce this state.
        await dropAllIndexes();
        await applyIndexSync();
        await nativeDb()
            .collection('users')
            .createIndex({ createdAt: -1 }, { name: 'users_orphan' });

        await applyIndexSync();

        const stored = await nativeDb().collection('users').indexes();
        expect(stored.map(({ name }) => name)).not.toContain('users_orphan');
    });

    it('is a no-op the second time', async () => {
        // It runs on every boot (`db:bootstrap`), so a second pass with work left to do would mean
        // the first one did not converge.
        await dropAllIndexes();
        await applyIndexSync();

        await expect(planIndexSync()).resolves.toEqual([]);
    });

    it('plans the work without doing it — `--check`', async () => {
        // The dry run an operator gets before letting this near a database they cannot rebuild.
        await dropAllIndexes();

        const plan = await planIndexSync();
        expect(plan.length).toBeGreaterThan(0);

        // Nothing was built, so the same plan is still pending.
        await expect(planIndexSync()).resolves.toEqual(plan);
    });

    it('scans only the unique indexes the plan would actually build', async () => {
        /*
         * The pre-flight is a grouping aggregation over a WHOLE collection, and `db:bootstrap` runs
         * it on every container boot. Scanning an index that already exists is a full pass over
         * production data to re-prove what that index is itself enforcing — so the scan is scoped
         * to what the plan would create.
         *
         * Two collections are given colliding rows and only one is named in the plan, so a scan
         * that quietly ignored its scope would report both and fail here.
         */
        await dropAllIndexes();
        await nativeDb()
            .collection('users')
            .insertMany([{ email: 'both@example.com' }, { email: 'both@example.com' }]);
        await nativeDb()
            .collection('carts')
            .insertMany([{ userId: 'dupe-user' }, { userId: 'dupe-user' }]);

        const usersOnly = [{ collection: 'users', toCreate: [{ email: 1 }], toDrop: [] }];

        await expect(findBlockingDuplicates(usersOnly)).resolves.toEqual([
            expect.stringContaining('both@example.com')
        ]);

        // Unscoped, the same database reports the cart collision too — so the scoping above is
        // what suppressed it, not an absence of anything to find.
        await expect(findBlockingDuplicates()).resolves.toEqual(
            expect.arrayContaining([expect.stringContaining('dupe-user')])
        );

        await nativeDb().collection('users').deleteMany({ email: 'both@example.com' });
        await nativeDb().collection('carts').deleteMany({ userId: 'dupe-user' });
    });

    it('refuses to build a unique index the existing rows already violate', async () => {
        /*
         * The failure that actually costs an evening. `createIndex` reports the FIRST colliding
         * value and nothing about the rest, so a naive run turns a data problem into a guessing
         * game — and which of two documents survives a merge is a product decision this script
         * does not get to make.
         *
         * Written through the driver rather than the model: the model's own unique index is
         * exactly what this case proves can be absent.
         */
        await dropAllIndexes();
        await nativeDb()
            .collection('users')
            .insertMany([{ email: 'clash@example.com' }, { email: 'clash@example.com' }]);

        await expect(findBlockingDuplicates()).resolves.toEqual([
            expect.stringContaining('clash@example.com')
        ]);
        await expect(applyIndexSync()).rejects.toThrow(/more than one document/);

        await nativeDb().collection('users').deleteMany({ email: 'clash@example.com' });
    });
});
