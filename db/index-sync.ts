/*
 * Reconcile the database's indexes with the schemas that declare them.
 *
 * This is the whole of "schema migration" in this repo. A module's `model.ts` is the only author
 * of an index; this compares what Mongo stores against what the schemas declare, creates the
 * missing and drops the rest. There is no changelog and no version, because there is nothing to
 * sequence: a desired STATE is re-applied on every deploy, not applied once and recorded.
 *
 * Data that cannot be derived from a schema — a rename, a backfill, a dedupe — is a one-off
 * script under `ops/`, run by hand. See `docs/reference/data.md`.
 *
 * Split from `sync-indexes.ts` so a test can drive the reconciliation; that file opens a
 * connection and runs on import, which a test cannot do per case.
 */

import mongoose from 'mongoose';
import type { IndexDefinition, IndexOptions } from 'mongoose';
/*
 * THE registry, and the only model registration this file needs: importing it pulls in every
 * enabled module's `module.ts`, which reaches its own `model.ts`. A module removed from that list
 * is never imported, so its models never register and `syncIndexes` leaves their collections
 * alone rather than dropping indexes a disabled domain still owns.
 */
import { enabledModules } from '../src/modules';

/**
 * One collection's difference between what is stored and what its schema declares.
 */
export interface IndexDiff {
    /** The collection Mongoose derived for the model. */
    collection: string;
    /** Index names present in the database that no schema declares. `sync` drops these. */
    toDrop: string[];
    /** Key specs the schema declares that the database does not hold. `sync` creates these. */
    toCreate: Record<string, unknown>[];
}

/**
 * The parts of a registered model this file reads.
 *
 * Declared rather than imported, and the reason nothing downstream is `any`: `mongoose.models` is
 * a map of `Model<any>`, and Mongoose types `IndexesDiff`'s two members as `Array<any>` — so every
 * access through either would launder an `any` into this file. Naming the three members actually
 * used narrows both at the one point they enter.
 */
interface RegisteredModel {
    collection: { name: string };
    schema: { indexes: () => [IndexDefinition, IndexOptions][] };
    diffIndexes: () => Promise<{ toCreate: Record<string, unknown>[]; toDrop: string[] }>;
}

/**
 * A unique index whose constraint existing rows might already violate.
 */
interface UniqueIndex {
    /** The collection it constrains. */
    collection: string;
    /** Its key spec as JSON, which is how a plan entry names an index it would create. */
    key: string;
    /** The fields that together must be unique. */
    keys: string[];
}

/** Every model the enabled modules registered, narrowed once so every caller stays typed. */
const registeredModels = (): RegisteredModel[] => Object.values(mongoose.models);

/**
 * Refuse to sync when nothing registered — an empty walk would report "0 changes" and pass.
 *
 * @throws when the module registry contributed no models
 */
const assertModelsRegistered = (): void => {
    if (registeredModels().length > 0) return;

    throw new Error(
        `no models registered — ${enabledModules.length} module(s) are enabled but none reached ` +
            'a `model.ts`. Refusing to sync, since dropping every index is what that would mean.'
    );
};

/**
 * Every unique index the schemas declare, as the collection and fields it constrains.
 *
 * Partial indexes are skipped: their filter selects a subset the duplicate scan below cannot
 * model, so a scan over the whole collection would report collisions the index would not reject.
 */
const uniqueIndexes = (): UniqueIndex[] =>
    registeredModels().flatMap((model) =>
        model.schema
            .indexes()
            .filter(([, options]) => options.unique && !options.partialFilterExpression)
            .map(([key]) => ({
                collection: model.collection.name,
                key: JSON.stringify(key),
                keys: Object.keys(key)
            }))
    );

/**
 * Groups of documents sharing a value on every key of a would-be unique index, worst first.
 *
 * Documents missing any key are excluded: an absent field is a different problem, and grouping
 * them would report a phantom duplicate.
 *
 * @param collection - the collection to scan
 * @param keys - the unique index's fields
 * @returns one entry per colliding value, with the offending document ids
 */
const findDuplicates = (collection: string, keys: string[]) =>
    mongoose.connection
        .collection(collection)
        .aggregate<{ _id: Record<string, unknown>; count: number; ids: unknown[] }>([
            { $match: Object.fromEntries(keys.map((key) => [key, { $exists: true, $ne: null }])) },
            {
                $group: {
                    _id: Object.fromEntries(
                        keys.map((key) => [key.replaceAll('.', '_'), `$${key}`])
                    ),
                    count: { $sum: 1 },
                    ids: { $push: '$_id' }
                }
            },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } }
        ])
        .toArray();

/**
 * Report every row a unique index would reject, before anything is built.
 *
 * `createIndex` fails on the FIRST offending value and says nothing about the rest, which is the
 * worst way to learn the shape of the problem. This collects every group across every unique index
 * in one pass, so one run tells you the whole job.
 *
 * @param plan - restrict the scan to the unique indexes this plan would CREATE. Each check is a
 *               grouping aggregation over a whole collection, and `db:bootstrap` runs on every
 *               container boot — so scanning an index that already exists is a full pass over
 *               production data to re-prove something the index itself is already enforcing.
 *               Omit it to audit every unique index regardless.
 * @returns a human-readable line per colliding value, empty when the database is clean
 */
export const findBlockingDuplicates = async (plan?: IndexDiff[]): Promise<string[]> => {
    const pending =
        plan &&
        new Set(
            plan.flatMap(({ collection, toCreate }) =>
                toCreate.map((key) => `${collection} ${JSON.stringify(key)}`)
            )
        );

    const blocking: string[] = [];

    for (const { collection, key, keys } of uniqueIndexes()) {
        if (pending && !pending.has(`${collection} ${key}`)) continue;

        for (const { _id, count, ids } of await findDuplicates(collection, keys))
            blocking.push(
                `${collection}.(${keys.join(', ')}) ${JSON.stringify(_id)} — ` +
                    `${count} rows: ${ids.join(', ')}`
            );
    }

    return blocking;
};

/**
 * What `applyIndexSync` would do, without doing it — `npm run db:sync -- --check`.
 *
 * Collections already in agreement are omitted, so an unchanged database reports an empty plan
 * rather than a wall of zeroes.
 *
 * @returns one entry per collection that would change
 */
export const planIndexSync = async (): Promise<IndexDiff[]> => {
    assertModelsRegistered();
    const plan: IndexDiff[] = [];

    for (const model of registeredModels()) {
        /*
         * Mongoose: a dry run of `syncIndexes()` for one model.
         * https://mongoosejs.com/docs/api/model.html#Model.diffIndexes()
         */
        const { toCreate, toDrop } = await model.diffIndexes();

        if (toCreate.length > 0 || toDrop.length > 0)
            plan.push({ collection: model.collection.name, toCreate, toDrop });
    }

    return plan;
};

/**
 * Make every registered model's collection hold exactly the indexes its schema declares.
 *
 * Pre-flighted, because the failure that matters is not the index build: it is a collection whose
 * existing rows cannot satisfy a new unique constraint. Which document survives a merge is a
 * product decision this script does not get to make, so it stops and reports instead.
 *
 * @returns the plan that was applied, for the caller to print
 * @throws when existing rows would violate a unique index
 */
export const applyIndexSync = async (): Promise<IndexDiff[]> => {
    const plan = await planIndexSync();

    const blocking = await findBlockingDuplicates(plan);
    if (blocking.length > 0)
        throw new Error(
            `Cannot build ${blocking.length} unique constraint(s) — these values are held by ` +
                `more than one document:\n${blocking.map((line) => `  ${line}`).join('\n')}\n\n` +
                'Merge or remove the duplicates, then run this again.'
        );

    /*
     * Mongoose: creates every index a schema declares and DROPS every other one on those
     * collections, `_id_` aside. Collections whose model is not registered are untouched.
     * https://mongoosejs.com/docs/api/connection.html#Connection.prototype.syncIndexes()
     */
    await mongoose.connection.syncIndexes();

    return plan;
};
