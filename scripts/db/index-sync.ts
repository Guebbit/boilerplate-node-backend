/*
 * Reconcile the database's indexes with the schemas that declare them.
 *
 * This is the whole of "schema migration" in this repo. A module's `model.ts` is the only author
 * of an index; this compares what Mongo stores against what the schemas declare and ADDS what is
 * missing. It never drops by surprise: an undeclared index is kept (and reported) unless the
 * caller asks to prune, so an older release running this after a rollback cannot delete the
 * newer release's indexes. There is no changelog and no version, because there is nothing to
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
 * is never imported, so its models never register and their collections are left alone rather
 * than touched on behalf of a disabled domain.
 */
import { enabledModules } from '../../src/modules';
import { JOB_MAX_TIME_MS } from '@infrastructure/runtime/database';
import { retiredIndexesOf } from '@infrastructure/persistence/retired-indexes';

/**
 * An index whose options changed: dropped under its old name, then built again from the schema.
 */
export interface ReplacedIndex {
    /** The stored name to drop. */
    name: string;
    /** The key spec the schema declares, which is built after the drop. */
    key: Record<string, unknown>;
}

/**
 * One collection's difference between what is stored and what its schema declares.
 */
export interface IndexDiff {
    /** The collection Mongoose derived for the model. */
    collection: string;
    /** Key specs the schema declares that the database does not hold. `sync` creates these. */
    toCreate: Record<string, unknown>[];
    /** Declared indexes whose options changed. `sync` drops each, then creates it again. */
    toReplace: ReplacedIndex[];
    /** Stored names the model listed as retired. `sync` drops these. */
    toDropRetired: string[];
    /** Stored names no schema declares, dropped only when pruning. */
    toDropUndeclared: string[];
    /** Stored names no schema declares that stay, because the caller did not ask to prune. */
    kept: string[];
}

/**
 * How `planIndexSync` and `applyIndexSync` treat an index nobody declares.
 */
export interface IndexSyncOptions {
    /** Drop every undeclared index too. A deploy never sets it; a dev database does. */
    prune?: boolean;
}

/**
 * Whether a collection's diff would change the database. `kept` alone is information, not work.
 *
 * @param diff - one collection's plan
 * @returns true when applying it would create or drop an index
 */
export const hasChanges = (diff: IndexDiff): boolean =>
    diff.toCreate.length > 0 ||
    diff.toReplace.length > 0 ||
    diff.toDropRetired.length > 0 ||
    diff.toDropUndeclared.length > 0;

/**
 * The parts of a registered model this file reads.
 *
 * Declared rather than imported, and the reason nothing downstream is `any`: `mongoose.models` is
 * a map of `Model<any>`, and Mongoose types `IndexesDiff`'s two members as `Array<any>` — so every
 * access through either would launder an `any` into this file. Naming the members actually used
 * narrows both at the one point they enter.
 */
interface RegisteredModel {
    collection: {
        name: string;
        indexes: () => Promise<{ name?: string; key: Record<string, unknown> }[]>;
        dropIndex: (name: string) => Promise<unknown>;
    };
    schema: { indexes: () => [IndexDefinition, IndexOptions][] };
    diffIndexes: () => Promise<{ toCreate: Record<string, unknown>[]; toDrop: string[] }>;
    createIndexes: () => Promise<unknown>;
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
        .aggregate<{ _id: Record<string, unknown>; count: number; ids: unknown[] }>(
            [
                {
                    $match: Object.fromEntries(
                        keys.map((key) => [key, { $exists: true, $ne: null }])
                    )
                },
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
            ],
            {
                // A raw driver call: Mongoose's global `maxTimeMS` does not reach it, and this scans
                // a whole collection. The job ceiling, set by hand.
                maxTimeMS: JOB_MAX_TIME_MS
            }
        )
        .toArray();

/**
 * Report every row a unique index would reject, before anything is built.
 *
 * `createIndex` fails on the FIRST offending value and says nothing about the rest, which is the
 * worst way to learn the shape of the problem. This collects every group across every unique index
 * in one pass, so one run tells you the whole job.
 *
 * @param plan - restrict the scan to the unique indexes this plan would CREATE or REPLACE. Each check is a
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
            plan.flatMap(({ collection, toCreate, toReplace }) =>
                [...toCreate, ...toReplace.map(({ key }) => key)].map(
                    (key) => `${collection} ${JSON.stringify(key)}`
                )
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
 * MongoDB's `NamespaceNotFound`: the answer to listing the indexes of a collection nothing has
 * written to yet, which is every collection on a database the app has never booted against.
 *
 * https://www.mongodb.com/docs/manual/reference/error-codes/
 *
 * @param error - whatever the driver rejected with
 * @returns true when the collection simply does not exist
 */
const isNamespaceNotFound = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 26;

/**
 * The indexes stored for a model, none when its collection does not exist yet.
 *
 * @param model - the registered model
 * @returns the stored indexes, `_id_` included
 */
const storedIndexesOf = (model: RegisteredModel) =>
    // Mongoose's collection passes this to the driver's `listIndexes` command: every index with its
    // name and key spec, `_id_` included. A collection that was never created answers
    // NamespaceNotFound, handled below.
    // https://www.mongodb.com/docs/manual/reference/command/listIndexes/
    model.collection.indexes().catch((error: unknown) => {
        if (isNamespaceNotFound(error)) return [];
        throw error;
    });

/**
 * Sort the stored names Mongoose says no schema declares into replaced, retired and the rest.
 *
 * A declared index whose options changed shows up twice in `diffIndexes()`: its old name in
 * `toDrop` and its key in `toCreate`. The stored key is what pairs them.
 *
 * @param model - the registered model
 * @param toCreate - key specs the schema declares that no stored index matches
 * @param toDrop - stored names no declaration matches
 * @param options - whether the rest is pruned or kept
 * @returns the collection's diff
 */
const classify = async (
    model: RegisteredModel,
    { toCreate, toDrop }: { toCreate: Record<string, unknown>[]; toDrop: string[] },
    { prune = false }: IndexSyncOptions
): Promise<IndexDiff> => {
    const stored = await storedIndexesOf(model);
    const storedKeyOf = new Map(
        stored.flatMap(({ name, key }) =>
            name === undefined ? [] : [[name, JSON.stringify(key)] as const]
        )
    );
    const retiredNames = new Set(retiredIndexesOf(model.schema));
    const toReplace: ReplacedIndex[] = [];
    const toDropRetired: string[] = [];
    const rest: string[] = [];
    const created = [...toCreate];

    for (const name of toDrop) {
        const at = created.findIndex((key) => JSON.stringify(key) === storedKeyOf.get(name));

        if (at !== -1) {
            const [key] = created.splice(at, 1);
            toReplace.push({ name, key });
        } else if (retiredNames.has(name)) toDropRetired.push(name);
        else rest.push(name);
    }

    return {
        collection: model.collection.name,
        toCreate: created,
        toReplace,
        toDropRetired,
        toDropUndeclared: prune ? rest : [],
        kept: prune ? [] : rest
    };
};

/**
 * What `applyIndexSync` would do, without doing it — `npm run db:sync -- --check`.
 *
 * Collections already in agreement are omitted, so an unchanged database reports an empty plan
 * rather than a wall of zeroes. A collection holding only undeclared indexes it would keep is
 * listed (so the operator sees them) but has no changes.
 *
 * @param options - `prune` to plan the drop of every undeclared index
 * @returns one entry per collection that would change or holds an undeclared index
 */
export const planIndexSync = async (options: IndexSyncOptions = {}): Promise<IndexDiff[]> => {
    assertModelsRegistered();
    const plan: IndexDiff[] = [];

    for (const model of registeredModels()) {
        /*
         * Mongoose: a dry run of `syncIndexes()` for one model.
         * https://mongoosejs.com/docs/api/model.html#Model.diffIndexes()
         */
        const diff = await classify(model, await model.diffIndexes(), options);

        if (hasChanges(diff) || diff.kept.length > 0) plan.push(diff);
    }

    return plan;
};

/**
 * Bring every registered model's collection up to the indexes its schema declares.
 *
 * Pre-flighted, because the failure that matters is not the index build: it is a collection whose
 * existing rows cannot satisfy a new unique constraint. Which document survives a merge is a
 * product decision this script does not get to make, so it stops and reports instead.
 *
 * Creates what is missing, replaces an index whose options changed, drops the names a model
 * retired, and keeps every other undeclared index unless `prune` is set.
 *
 * @param options - `prune` to drop every undeclared index as well
 * @returns the plan that was applied, for the caller to print
 * @throws when existing rows would violate a unique index
 */
export const applyIndexSync = async (options: IndexSyncOptions = {}): Promise<IndexDiff[]> => {
    const plan = await planIndexSync(options);

    const blocking = await findBlockingDuplicates(plan);
    if (blocking.length > 0)
        throw new Error(
            `Cannot build ${blocking.length} unique constraint(s) — these values are held by ` +
                `more than one document:\n${blocking.map((line) => `  ${line}`).join('\n')}\n\n` +
                'Merge or remove the duplicates, then run this again.'
        );

    const modelOf = new Map(registeredModels().map((model) => [model.collection.name, model]));

    for (const diff of plan.filter((entry) => hasChanges(entry))) {
        const model = modelOf.get(diff.collection);
        if (!model) continue;

        const drops = [
            ...diff.toReplace.map(({ name }) => name),
            ...diff.toDropRetired,
            ...diff.toDropUndeclared
        ];
        for (const name of drops) await model.collection.dropIndex(name);

        /*
         * Mongoose: builds every index the schema declares. One that already exists with the same
         * spec is a no-op, so this creates exactly the missing and the just-dropped.
         * https://mongoosejs.com/docs/api/model.html#Model.createIndexes()
         */
        await model.createIndexes();
    }

    return plan;
};
