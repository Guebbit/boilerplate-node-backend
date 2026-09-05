#!/usr/bin/env tsx
/**
 * Assemble `db/migrations/` — `npm run gen:migrations`.
 *
 * The directory is a BUNDLE, not a source: the generated index baseline plus every migration the
 * enabled modules own, exactly as `openapi.yaml` is assembled from per-module fragments. Nothing
 * here is committed, so a stale copy cannot exist and there is no `--check` to run.
 *
 * See: docs/reference/data.md
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import type { IndexDefinition, IndexOptions } from 'mongoose';
import { format, resolveConfig } from 'prettier';
import { collectModuleMigrations } from './module-migrations';

const ROOT = path.join(__dirname, '..', '..');
const MODULES_ROOT = path.join(ROOT, 'src', 'modules');
const MIGRATIONS_DIR = path.join(ROOT, 'db', 'migrations');

/**
 * The migration's filename, fixed forever.
 *
 * `migrate-mongo` records what it has applied by NAME, so a changing one would re-run the baseline
 * against every database that already holds it and add a second changelog row for the same work.
 */
const MIGRATION_FILE = '20260905000000-baseline.js';

const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILE);

/**
 * The parts of a registered model this generator reads.
 *
 * Declared rather than imported: `mongoose.models` is a map of `Model<any>`, and every access
 * through that generic reads as `any` downstream. Naming the three members actually used is what
 * keeps the rest of this file typed.
 */
interface RegisteredModel {
    modelName: string;
    collection: { name: string };
    schema: { indexes: () => [IndexDefinition, IndexOptions][] };
}

/** One index, resolved to everything the generated table needs to state. */
interface IndexEntry {
    /** The module whose `model.ts` registered the model that declares it. */
    module: string;
    /** Mongo's own collection name, as Mongoose derives it. */
    collection: string;
    /** The index's key spec. */
    key: IndexDefinition;
    /** The index's options, exactly as the schema gives them. */
    options: IndexOptions;
}

/**
 * Register every module's models, remembering which module brought each one in.
 *
 * By DISCOVERY rather than by name: a module added tomorrow is swept without editing this file,
 * which is the whole point of generating. A model imported as a side effect of another module's
 * `model.ts` is attributed to the module that owns its file, not to whoever imported it first.
 *
 * @returns model name → owning module directory
 */
const registerModels = async (): Promise<Record<string, string>> => {
    const owners: Record<string, string> = {};

    for (const name of fs.readdirSync(MODULES_ROOT).toSorted()) {
        const modelFile = path.join(MODULES_ROOT, name, 'model.ts');
        if (!fs.existsSync(modelFile)) continue;

        const source = fs.readFileSync(modelFile, 'utf8');
        await import(modelFile);

        // Attributed by the model name appearing in the module's own source, so `products` keeps
        // its models even though `orders/model.ts` imports them first.
        for (const modelName of Object.keys(mongoose.models))
            if (!owners[modelName] && source.includes(`'${modelName}'`)) owners[modelName] = name;
    }

    return owners;
};

/**
 * Every non-TTL index the schemas declare, grouped later by owning module.
 *
 * TTL indexes are excluded: `expireAfterSeconds` is derived from an environment variable, so a
 * copy of that arithmetic in a migration could disagree with the schema's and make every boot an
 * `IndexOptionsConflict`. `tests/integration/db/migration-model-indexes.test.ts` exempts them by
 * the same option, so the two agree without either naming a collection.
 *
 * @param owners - model name → owning module, from `registerModels`
 * @returns the entries, module then collection then key order
 */
const collectIndexes = (owners: Record<string, string>): IndexEntry[] => {
    const entries: IndexEntry[] = [];

    // Narrowed from Mongoose's own `Model<any>` map, so nothing downstream reads as `any`.
    const models = Object.values(mongoose.models) as RegisteredModel[];

    for (const model of models) {
        const declared = model.schema.indexes();

        for (const [key, options] of declared) {
            if (options.expireAfterSeconds) continue;

            entries.push({
                module: owners[model.modelName] ?? model.modelName,
                collection: model.collection.name,
                key,
                options
            });
        }
    }

    return entries.toSorted(
        (a, b) =>
            a.module.localeCompare(b.module) ||
            a.collection.localeCompare(b.collection) ||
            JSON.stringify(a.key).localeCompare(JSON.stringify(b.key))
    );
};

/** One `[collection, keySpec, options]` row, as JavaScript source. Prettier decides the wrapping. */
const renderEntry = ({ collection, key, options }: IndexEntry): string =>
    `[${JSON.stringify(collection)}, ${JSON.stringify(key)}, ${JSON.stringify(options)}],`;

/** The table body: every entry, with a comment naming the module each group belongs to. */
const renderTable = (entries: IndexEntry[]): string => {
    const lines: string[] = [];
    let currentModule = '';

    for (const entry of entries) {
        if (entry.module !== currentModule) {
            if (currentModule) lines.push('');
            lines.push(`/* ${entry.module} */`);
            currentModule = entry.module;
        }
        lines.push(renderEntry(entry));
    }

    return lines.join('\n');
};

/**
 * The whole migration file.
 *
 * Everything but the table is fixed text: the pre-flight, the `up` and the `down` do not vary with
 * what the schemas say, only the rows do.
 *
 * @param entries - the indexes to build
 * @returns the file's source, before formatting
 */
const renderMigration = (entries: IndexEntry[]): string => `/*
 * GENERATED by \`npm run gen:migrations\` from the schemas in each module's \`model.ts\`. Do not edit.
 *
 * Every index the application needs, built before it boots — so \`db:migrate:up\` alone puts the
 * whole set in place, including the unique constraints that are correctness rather than speed.
 * Add an index by declaring it on its schema and regenerating; the reason it exists belongs in the
 * comment there, next to the declaration, not here.
 *
 * TTL indexes are absent by design: their window comes from an environment variable, and a second
 * copy of that arithmetic here could disagree with the schema's.
 */

/** The indexes this migration owns, as \`[collection, keySpec, options]\`, grouped by module. */
const INDEXES = [
${renderTable(entries)}
];

/**
 * The name Mongo gives an index created without one: every key and its direction, joined by \`_\`.
 *
 * Needed only by \`down\`, which has to name an index the driver will accept as a string.
 *
 * @param {Record<string, number>} keySpec the index's keys
 * @returns {string} the derived index name
 */
const derivedName = (keySpec) =>
    Object.entries(keySpec)
        .map(([field, direction]) => \`\${field}_\${direction}\`)
        .join('_');

/**
 * Groups of documents sharing a value on every key of a unique index, worst first.
 *
 * Documents missing any key are excluded: an absent required field is a different problem, and
 * grouping them would report a phantom duplicate.
 *
 * @param {import('mongodb').Db} db native driver handle
 * @param {string} collectionName collection to scan
 * @param {string[]} keys the unique index's fields
 * @returns {Promise<{_id: Record<string, unknown>, count: number, ids: unknown[]}[]>}
 */
const findDuplicates = (db, collectionName, keys) =>
    db
        .collection(collectionName)
        .aggregate([
            { $match: Object.fromEntries(keys.map((key) => [key, { $exists: true, $ne: null }])) },
            {
                $group: {
                    _id: Object.fromEntries(
                        keys.map((key) => [key.replaceAll('.', '_'), \`$\${key}\`])
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
 * Refuses the run when a collection already holds rows a unique index would reject.
 *
 * \`createIndex\` fails on the FIRST offending value and says nothing about the rest, which is the
 * worst way to learn the shape of the problem. This reports every group at once and stops, because
 * which document survives a merge is a product decision this file does not get to make.
 *
 * @param {import('mongodb').Db} db native driver handle
 * @param {string} collectionName collection to scan
 * @param {string[]} keys the unique index's fields
 * @throws {Error} when any group holds more than one document
 */
const refuseDuplicates = async (db, collectionName, keys) => {
    const duplicates = await findDuplicates(db, collectionName, keys);
    if (duplicates.length === 0) return;

    const report = duplicates
        .map(({ _id, count, ids }) => \`  \${JSON.stringify(_id)} — \${count} rows: \${ids.join(', ')}\`)
        .join('\\n');

    throw new Error(
        \`Cannot make \${collectionName}.(\${keys.join(', ')}) unique: \${duplicates.length} \` +
            \`value(s) are held by more than one document.\\n\${report}\\n\\n\` +
            \`Merge or remove the duplicates, then run this migration again.\`
    );
};

module.exports = {
    async up(db) {
        // Every unique index is pre-flighted before anything is built, so a database that cannot
        // satisfy one of them is reported in full rather than left half-indexed. A partial index
        // is skipped: it constrains only the subset its filter selects, which the scan cannot model.
        for (const [collection, keySpec, options] of INDEXES)
            if (options.unique && !options.partialFilterExpression)
                await refuseDuplicates(db, collection, Object.keys(keySpec));

        // \`createIndex\` is a no-op when name, key spec AND options all match, so a database that
        // has already booted once passes through this untouched.
        await Promise.all(
            INDEXES.map(([collection, keySpec, options]) =>
                db.collection(collection).createIndex(keySpec, options)
            )
        );
    },

    async down(db) {
        // Best-effort: a database that never ran \`up\`, or one where an index was dropped by hand,
        // must not fail the rollback.
        for (const [collection, keySpec, options] of INDEXES)
            await db
                .collection(collection)
                .dropIndex(options.name ?? derivedName(keySpec))
                .catch(() => {
                    /* never created, or already dropped */
                });
    }
};
`;

/**
 * Rebuild `db/migrations/` from scratch.
 *
 * Emptied rather than merged into: the directory is generated output, so a migration deleted from
 * a module — or a whole module removed from the manifest — has to disappear from the bundle too.
 */
const resetMigrationsDirectory = (): void => {
    fs.rmSync(MIGRATIONS_DIR, { recursive: true, force: true });
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
};

const main = async () => {
    const owners = await registerModels();
    const entries = collectIndexes(owners);

    if (entries.length === 0)
        throw new Error('no indexes found — the module walk registered nothing, refusing to write');

    const prettierConfig = await resolveConfig(MIGRATION_PATH);
    const baseline = await format(renderMigration(entries), {
        ...prettierConfig,
        filepath: MIGRATION_PATH
    });

    /*
     * Imported here, and only here, so the baseline above is computed against exactly the models
     * `registerModels` walked — pulling the manifest in at the top would register every model
     * ahead of that walk and could reattribute one to whichever module names it first.
     *
     * Resolved before anything is deleted, so a malformed or duplicated filename leaves the
     * existing bundle intact instead of emptying it and then failing.
     */
    const { enabledModules } = await import('../../src/modules');
    const moduleMigrations = collectModuleMigrations(enabledModules);

    resetMigrationsDirectory();
    fs.writeFileSync(MIGRATION_PATH, baseline);
    for (const { file, source } of moduleMigrations)
        fs.copyFileSync(source, path.join(MIGRATIONS_DIR, file));

    console.info(
        `[gen:migrations] db/migrations/ — ${MIGRATION_FILE} (${entries.length} indexes) ` +
            `+ ${moduleMigrations.length} module migration(s).`
    );
    process.exit(0);
};

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
