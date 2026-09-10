/**
 * Assemble the demo dataset from whatever is currently in the database.
 *
 * Reads every demo module's rows back through the real serializers, checks the result is
 * internally consistent, and renders it as the bytes `db/demo/demo-data.json` holds. Nothing here
 * connects, seeds or writes — the caller supplies an open connection and decides what to do with
 * the string.
 *
 * ## Why this is a module and not part of the export script
 *
 * Two callers need the same answer from the same rows — `scripts/demo/export-dataset.ts`
 * publishes it against a database it seeded from scratch, and `npm run check:seed-export`
 * re-derives it and compares against the committed bytes. A second implementation of this walk
 * would let those two disagree about what the dataset even is, which is the class of bug the
 * published-output design exists to remove. So there is one assembler and both callers import it.
 *
 * ## Determinism is a hard requirement
 *
 * The output is committed and `npm run check:seed-export` re-derives it in the gate, so two runs
 * must produce identical bytes. Three things buy that: fixtures pin their own `createdAt` (see
 * `@infrastructure/persistence/factory`), seed writes pass `{ timestamps: false }` so Mongoose does
 * not overwrite them, and this file sorts both the rows and every object key on the way out. If a
 * value ever enters the dataset that cannot be pinned, it does not belong in the export.
 */

import path from 'node:path';
import { demoModules } from '@demo/index';
import { seedCredentials } from '../../src/kernel/seed-accounts';

/* The dataset sits beside the seeder that produces the rows, not beside this file: `db/` is where
 * the demo data lives, and this is only the tool that renders it.
 *
 * `__dirname`, not `import.meta.dirname` — tsx and ts-jest both load this as CommonJS, where the
 * latter is undefined. `scripts/contracts/bundle-kinds.ts` resolves its own root the same way. */
export const DEMO_DATA_PATH = path.join(__dirname, '../../db/demo/demo-data.json');

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
 *
 * `structuredClone` is not a substitute and the lint rule suggesting it is wrong here: it copies by
 * the structured-clone algorithm, which never calls `toJSON`. An ObjectId would survive as an
 * object and a Date as a Date, which is precisely the state this converts away from.
 */
// eslint-disable-next-line unicorn/prefer-structured-clone -- the JSON round-trip is the point: it converts ObjectId and Date to the forms the file stores
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
            .toSorted(([left], [right]) => left.localeCompare(right))
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
        for (const [index, item] of value.entries())
            findDanglingReferences(item, known, `${trail}[${index}]`, problems);
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

export const assembleDemoDataset = async (): Promise<string> => {
    const modules = Object.values(demoModules);
    const sections = await Promise.all(modules.map((demoModule) => demoModule.export()));

    /*
     * Collections are keyed and then sorted by name rather than kept in table order, so that
     * reordering `demo/index.ts`'s table — or renaming a module, which moves it in that table —
     * does not rewrite the file and light up the cross-repo hash check for no reason.
     */
    const merged = Object.assign({}, ...sections) as Record<string, unknown[]>;
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
