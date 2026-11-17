/**
 * @module
 * The demo profile's restore machinery: empty the database, read it whole into memory, write a
 * copy back. Split from `src/infrastructure/runtime/database.ts` — connection lifecycle is a
 * different concern from taking and replaying a snapshot, and only `./demo` and
 * `scenarios/apply.ts` need this half.
 *
 * @see docs/understand/mongodb-mongoose.md#seeds
 */

/**
 * The driver's own raw-document type: what `collection.find()` yields and `collection.insertMany()`
 * takes, with no Mongoose hydration in between. https://mongodb.github.io/node-mongodb-native/
 */
import type { Document } from 'mongodb';
import { connection, JOB_MAX_TIME_MS } from '@infrastructure/runtime/database';

/**
 * The seeder's own note collection: one document, `running` from before the first write until
 * `done` as the last. Registered on the connection by name, so every walk below sees it and
 * has to decide what to do with it.
 */
export const SEED_MARKER_COLLECTION = 'seed_marker';

/** Where the seeder is in its one job, as the note records it. */
export type SeedMarkerState = 'running' | 'done';

/** The note's single document id: one note per database. */
const SEED_MARKER_ID = 'seed';

/**
 * Collections that never count as data: cron's bookkeeping rows (`leases`, written every minute
 * by a container that does not wait for the app's first seed) and the note itself.
 */
const IGNORED_FOR_EMPTINESS: ReadonlySet<string> = new Set(['leases', SEED_MARKER_COLLECTION]);

/**
 * Empty every collection, never drop the database.
 *
 * `dropDatabase()` looks like the obvious reset, but it clears each model's index build along
 * with the data — Mongoose only runs `Model.init()` at connect and at schema compile, neither of
 * which fires again after a drop. Everything a unique or TTL index enforces (duplicate-email
 * refusal, payment idempotency, cart expiry) is silently gone until the process restarts. Emptying
 * leaves every collection, and every index on it, exactly where `start()` built it.
 *
 * Used by `./demo`'s `restoreScenario` and `scenarios/apply.ts --reset` — the same bug,
 * against the same two callers, is why this is one helper rather than two.
 *
 * @param keep collection names to leave alone: the seeder passes the note's, so a process dying
 *             mid-wipe still finds `running` on the next boot.
 */
export const emptyDatabase = (keep: readonly string[] = []): Promise<void> =>
    Promise.all(
        Object.entries(connection.collections)
            .filter(([name]) => !keep.includes(name))
            .map(([, collection]) => collection.deleteMany({}))
    ).then(() => undefined);

/**
 * Whether every collection is empty, ignoring `leases` and the seed note.
 *
 * `scenarios/apply.ts`'s guard: the flows it runs are not idempotent — driving a checkout twice
 * makes two orders — so seeding on top of existing data is refused rather than attempted. Stops
 * at the first collection holding anything.
 */
export const isDatabaseEmpty = async (): Promise<boolean> => {
    for (const [name, collection] of Object.entries(connection.collections))
        if (
            !IGNORED_FOR_EMPTINESS.has(name) &&
            (await collection.countDocuments({}, { limit: 1 })) > 0
        )
            return false;
    return true;
};

/** The seed note's state, or `undefined` when the seeder never wrote one here. */
export const readSeedMarker = (): Promise<SeedMarkerState | undefined> =>
    connection
        .collection<{ _id: string; state: SeedMarkerState }>(SEED_MARKER_COLLECTION)
        .findOne({ _id: SEED_MARKER_ID })
        .then((note) => note?.state);

/** Upsert the seed note: `running` before the first write, `done` as the very last one. */
export const writeSeedMarker = (state: SeedMarkerState): Promise<void> =>
    connection
        .collection<{ _id: string; state: SeedMarkerState }>(SEED_MARKER_COLLECTION)
        .updateOne({ _id: SEED_MARKER_ID }, { $set: { state } }, { upsert: true })
        .then(() => undefined);

/**
 * Every document in every collection, as plain BSON — the input {@link restoreDatabaseCopy} takes.
 *
 * Keyed by collection NAME rather than by model. The walk is over `connection.collections`, which
 * lists only collections a model (or a `connection.collection()` call) registered — one that
 * exists only in the database is neither copied nor emptied. `Document` here is the driver's raw shape, not a Mongoose document — nothing
 * hydrates on the way out or on the way back in.
 */
export type DatabaseCopy = Readonly<Record<string, Document[]>>;

/**
 * Read the whole database into memory.
 *
 * Exists for `./demo`: a `shop` restore replays this copy instead of reseeding, which
 * skips the fourteen password hashes and the whole HTTP flow run that produced the
 * scenario in the first place. Nothing else should reach for it — a copy of the database in a
 * process's heap is only affordable because the demo profile's database is small and disposable.
 */
export const captureDatabase = (): Promise<DatabaseCopy> =>
    Promise.all(
        Object.entries(connection.collections).map(([name, collection]) =>
            collection
                .find({}, { maxTimeMS: JOB_MAX_TIME_MS })
                .toArray()
                .then((documents): [string, Document[]] => [name, documents])
        )
    ).then((entries) => Object.fromEntries(entries));

/**
 * Empty every collection and write `copy` back, exactly as {@link captureDatabase} read it.
 *
 * `insertMany` with `ordered: false`, so one rejected document does not abandon the rest of that
 * collection — the failure then names every problem rather than the first. Empty collections are
 * skipped: `insertMany([])` is an error in the driver, not a no-op.
 * https://www.mongodb.com/docs/manual/reference/method/db.collection.insertMany/
 *
 * MUST NOT run concurrently with itself — `./demo`'s restore queue is what guarantees
 * that. Two overlapping replays of the same copy collide on `_id`.
 */
export const restoreDatabaseCopy = (copy: DatabaseCopy): Promise<void> =>
    emptyDatabase()
        .then(() =>
            Promise.all(
                Object.entries(copy)
                    .filter(([, documents]) => documents.length > 0)
                    .map(([name, documents]) =>
                        connection.collection(name).insertMany(documents, { ordered: false })
                    )
            )
        )
        .then(() => undefined);
