#!/usr/bin/env tsx
/**
 * Publish the demo dataset as the API actually serves it — `npm run seed:export`.
 *
 * ## What this replaces, and why
 *
 * The two repos used to SHARE SOURCE. `db/seeds/seed-identities.ts` was a dependency-free file of
 * plain facts — ids, emails, prices — assembled from a fragment in every module and copied verbatim
 * into the frontend, where a hash check proved the copies had not forked. Each side then wrote its
 * own mapper from those facts into the shape it needed.
 *
 * Sharing the facts left the MAPPERS unchecked, and that is where the drift actually lived. The
 * frontend's mock carried a hand-written `active: true` and `verified: true` because someone had
 * read the backend's schema once and copied the defaults across; it carried no `locale` at all,
 * because nobody remembered the column existed. Every spec on both sides stayed green, since each
 * was consistent with its own copy.
 *
 * So this publishes the OUTPUT instead of the input. It seeds a throwaway database with the real
 * seeders, reads every row back through the real serializers, and writes the result to
 * `db/demo/demo-data.json`. Schema defaults, derived totals and serializer omissions are all in
 * there because the API produced them, not because a fixture claimed them.
 *
 * ## Why a real database rather than calling the serializers directly
 *
 * The transforms are only half of what shapes a response. `default:` values are applied by Mongoose
 * on write, the password hash is applied by a pre-save hook, and `select: false` decides what a read
 * can even see. Running the fixtures through a `mongod` is what makes the published rows the rows
 * the API would serve — anything short of it re-introduces a mapper, which is the thing being
 * removed.
 *
 * ## Determinism is a hard requirement
 *
 * The output is committed and hash-compared against the paired frontend, so two runs must produce
 * identical bytes. Three things buy that: fixtures pin their own `createdAt` (see
 * `@infrastructure/persistence/factory`), seed writes pass `{ timestamps: false }` so Mongoose does
 * not overwrite them, and this file sorts both the rows and every object key on the way out. If a
 * value ever enters the dataset that cannot be pinned, it does not belong in the export.
 *
 * Usage:
 *   npm run seed:export            # write db/demo/demo-data.json
 *   npm run check:seed-export      # fail if the committed file is stale, write nothing
 */

import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { seedCredentials } from '../src/kernel/seed-accounts';
import { enabledModules } from '../src/modules';

/* `__dirname`, not `import.meta.dirname` — tsx loads this as CommonJS, where the latter is
 * undefined. `scripts/contracts/fragments.ts` resolves its own root the same way. */
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(REPO_ROOT, 'db', 'demo', 'demo-data.json');
const checkOnly = process.argv.includes('--check');

/* Same pre-installed binary the test suite uses (`npm run setup:mongod`), same fallback: absent,
 * mongodb-memory-server downloads one on first run. */
const systemBinary = process.env.MONGOMS_SYSTEM_BINARY ?? '/tmp/mongod';
if (existsSync(systemBinary)) {
    process.env.MONGOMS_SYSTEM_BINARY = systemBinary;
    process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
    process.env.MONGOMS_MD5_CHECK = 'false';
}

/**
 * Flatten to plain JSON before anything walks the structure.
 *
 * `toJSON()` on a Mongoose document leaves NESTED `ObjectId`s and `Date`s as live class instances —
 * only the top-level `_id` is stringified, by the serializer. `JSON.stringify` would call their own
 * `toJSON` and get `'65dc8a99…'` and an ISO string, but only if it reaches them first. A key-sorter
 * that recurses in before then sees an ObjectId as an ordinary object and rewrites it as its
 * internal byte buffer — twelve numbered keys where a hex string belongs.
 *
 * So the round-trip happens up front, once, and everything downstream works on plain data.
 */
const toPlainJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Narrow to something with string keys — a real type guard, not an assertion.
 *
 * The three walkers below all need it, and the alternative was `value as Record<string, unknown>`
 * after a `typeof` check. That cast was TIGHTENING rather than loosening (`Object.entries` on a
 * bare `object` hands back `any`), but a guard says the same thing without asserting anything, and
 * the compiler carries the narrowing into the loop body for free.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * Recursively sort object keys so the committed file is byte-stable and its diffs are readable.
 *
 * Arrays keep their order — each module already sorts its own rows, and reordering a cart's lines
 * would change what the dataset says.
 */
const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map((item) => sortKeys(item));
    if (!isRecord(value)) return value;
    return Object.fromEntries(
        Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, sortKeys(item)])
    );
};

/** Every `id` the dataset publishes, at any depth — the set a reference is allowed to point into. */
const collectIds = (value: unknown, found: Set<string>): Set<string> => {
    if (Array.isArray(value)) {
        for (const item of value) collectIds(item, found);
        return found;
    }
    if (!isRecord(value)) return found;

    for (const [key, item] of Object.entries(value)) {
        if (key === 'id' && typeof item === 'string') found.add(item);
        collectIds(item, found);
    }
    return found;
};

/**
 * Every `<something>Id` in the dataset must name a record the dataset also publishes.
 *
 * This is what replaces the old shared file's one real safety property. Back then a cart line and
 * the product it pointed at were literally the same constant, so they could not disagree; now each
 * module states its own ids and a typo would seed a cart holding a product that does not exist —
 * which renders as a mysteriously empty page rather than an error.
 *
 * Deliberately structural rather than domain-aware: this script names no module, exactly as
 * `db/demo/index.ts` names none, so a new collection is covered the day it is added.
 */
const findDanglingReferences = (
    value: unknown,
    known: Set<string>,
    trail: string,
    problems: string[] = []
): string[] => {
    if (Array.isArray(value)) {
        value.forEach((item, index) =>
            findDanglingReferences(item, known, `${trail}[${index}]`, problems)
        );
        return problems;
    }
    if (!isRecord(value)) return problems;

    for (const [key, item] of Object.entries(value)) {
        if (key.endsWith('Id') && typeof item === 'string' && !known.has(item))
            problems.push(`${trail}.${key} → ${item}, which no seeded record has`);
        findDanglingReferences(item, known, `${trail}.${key}`, problems);
    }
    return problems;
};

const assemble = async (): Promise<string> => {
    const sections = await Promise.all(
        enabledModules.map((appModule) => appModule.seedExport?.() ?? {})
    );

    /*
     * Collections are keyed and then sorted by name rather than kept in module order, so that
     * reordering `enabledModules` — or renaming a module, which moves it in that list — does not
     * rewrite the file and light up the cross-repo hash check for no reason.
     */
    const merged: Record<string, unknown[]> = Object.assign({}, ...sections);
    const collections = toPlainJson(merged);

    const dataset = { credentials: seedCredentials, collections };

    const dangling = findDanglingReferences(
        collections,
        collectIds(collections, new Set()),
        'seed'
    );
    if (dangling.length > 0)
        throw new Error(
            `[seed-export] the dataset references records it does not contain:\n` +
                dangling.map((problem) => `  ${problem}`).join('\n')
        );

    return `${JSON.stringify(sortKeys(dataset), undefined, 4)}\n`;
};

const run = async (): Promise<number> => {
    const server = await MongoMemoryServer.create();
    /* `getDatabaseUri()` reads this first, so the app's own connect path is the one used here. */
    process.env.NODE_DB_URI = server.getUri();

    try {
        await mongoose.connect(process.env.NODE_DB_URI);
        await Promise.all(enabledModules.map((appModule) => appModule.seeds?.() ?? []));

        const assembled = await assemble();
        const committed = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';

        if (assembled === committed) {
            console.info('[seed-export] db/demo/demo-data.json is up to date.');
            return 0;
        }

        if (checkOnly) {
            console.error(
                `[seed-export] STALE — db/demo/demo-data.json does not match what the seeders produce.\n` +
                    `  A fixture changed without the dataset being re-exported, or the file was hand-edited.\n` +
                    `  Fix with: npm run seed:export\n` +
                    `  Then copy the result to the paired frontend — check:spec-identity compares them.`
            );
            return 1;
        }

        writeFileSync(OUTPUT, assembled);
        console.info('[seed-export] wrote db/demo/demo-data.json.');
        return 0;
    } finally {
        /* Both are no-ops if the step above never got that far, which covers an early throw. */
        await mongoose.disconnect();
        await server.stop();
    }
};

run().then(
    (code) => process.exit(code),
    (error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
);
