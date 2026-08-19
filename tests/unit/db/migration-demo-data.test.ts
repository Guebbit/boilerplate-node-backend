/**
 * A migrated database must still hold the dataset the artefact publishes.
 *
 * `db/demo/demo-data.json` is produced by `npm run seed:export`, which starts a throwaway
 * `mongodb-memory-server`, runs the seeders and reads every row back through the real serializers.
 * That database has never been migrated. A real one always has: `npm run db:bootstrap` is
 * `db:migrate:up && db:seed`, and on a long-lived database the two interleave the other way round
 * — rows were seeded months ago and a migration lands on top of them.
 *
 * Eight of the twelve migrations rewrite DATA rather than indexes, and one of them
 * (`20260806140000-image-url-separators.js`) rewrites `imageUrl` on products, on users, and inside
 * every order's embedded product snapshot, matching against a hardcoded list of fixture filenames.
 * A fixture whose image name drifts from that list leaves the migration rewriting seeded rows into
 * a shape the artefact does not record — and every other gate stays green while it does:
 *
 *   - `check:seed-export` re-runs the migration-free path, so it agrees with itself;
 *   - `seed-conformance.test.ts` validates the artefact against the generated schemas, which the
 *     drifted rows would still satisfy;
 *   - `check:spec-identity` compares the frontend's copy to this one, and both are the same file.
 *
 * Nothing else puts a migration and a seeder in the same database. This does, in both orders, and
 * asserts the result is byte-identical to what is committed.
 *
 * ── WHY IT COMPARES THE WHOLE DOCUMENT ───────────────────────────────────────────────────────────
 * The assertion is one string equality against the committed file rather than a list of properties
 * worth checking. A property list can only fail on a field somebody predicted; the failure this
 * exists for is a migration touching a field nobody thought about. Jest prints the diff, so a
 * failure still names the collection and the key that moved.
 *
 * `db/demo/assemble.ts` is imported rather than reimplemented for the same reason: two walks over
 * the same rows could disagree about what the dataset is, which is the drift the published-output
 * design removes in the first place.
 *
 * ── DELIBERATELY NOT ASSERTED ────────────────────────────────────────────────────────────────────
 * That the migrations produce the artefact from an UNSEEDED database. They cannot — most of them
 * rewrite rows the seeders write, so there is nothing to act on. Seeding is what creates the data;
 * migrating is what is allowed to leave it alone.
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connect, disconnect } from '@tests/database';
import { assembleDemoDataset, DEMO_DATA_PATH } from '../../../db/demo/assemble';
import { enabledModules } from '../../../src/modules';

const MIGRATIONS_DIR = path.join(__dirname, '../../../db/migrations');

/** Every migration module, in the order `migrate-mongo` would apply them. */
const migrations = fs
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

const nativeDb = () => {
    const { db } = mongoose.connection;
    if (!db) throw new Error('no database handle — the test connection is not open');
    return db;
};

/** Apply every migration's `up` against the live test database, as `migrate-mongo` would. */
const runMigrations = async () => {
    for (const { module } of migrations) await module.up(nativeDb());
};

/**
 * Seed the way `db/demo/index.ts` does, minus the runner.
 *
 * That file owns the connection, the production gate and the cache invalidation; none of those
 * belong in a test, and the walk over `enabledModules` is the only part that writes rows. Calling
 * the manifest entry directly means a module added tomorrow is seeded here without an edit.
 */
const runSeeders = () =>
    Promise.all(enabledModules.map((appModule) => appModule.seeds?.() ?? Promise.resolve([])));

/**
 * Empty every collection without dropping the database.
 *
 * Dropping would take the indexes with it, and several migrations only create an index once — so a
 * later case would run against a database missing what an earlier one built, and fail for a reason
 * that has nothing to do with the dataset.
 */
const wipeRows = async () => {
    const collections = await nativeDb().collections();
    for (const collection of collections) await collection.deleteMany({});
};

const committedArtefact = () => fs.readFileSync(DEMO_DATA_PATH, 'utf8');

beforeAll(connect);
afterAll(disconnect);
beforeEach(wipeRows);

describe('the demo dataset survives the migrations', () => {
    it('found the migrations and the seeders, so the assertions below are not vacuous', () => {
        expect(migrations.length).toBeGreaterThan(0);
        expect(enabledModules.filter((appModule) => appModule.seeds).length).toBeGreaterThan(0);
    });

    it('publishes what a fresh install holds — migrate, then seed', async () => {
        // The `db:bootstrap` ordering: migrations meet an empty database, then the seeders write.
        await runMigrations();
        await runSeeders();

        await expect(assembleDemoDataset()).resolves.toEqual(committedArtefact());
    });

    it('publishes what a long-lived database holds — seed, then migrate', async () => {
        // The ordering that actually drifts: the rows were written first and a migration lands on
        // top of them, rewriting whatever it recognises.
        await runSeeders();
        await runMigrations();

        await expect(assembleDemoDataset()).resolves.toEqual(committedArtefact());
    });

    it('is unchanged by migrations that run more than once', async () => {
        // `migrate-mongo` tracks what it has applied, but nothing stops a migration being replayed
        // against a restored dump or a rebuilt changelog — and a rewrite that is not idempotent
        // corrupts on the second pass rather than the first.
        await runSeeders();
        await runMigrations();
        await runMigrations();

        await expect(assembleDemoDataset()).resolves.toEqual(committedArtefact());
    });
});
