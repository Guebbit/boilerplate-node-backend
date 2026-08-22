import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Guard: a `$sort` that a `$skip` pages through must be TOTAL — its last key unique.
 *
 * `DEFAULT_SORT` exists because `createdAt` is not unique: a seed, a bulk import or two concurrent
 * checkouts land inside the same millisecond, and MongoDB guarantees no particular order among
 * documents whose sort keys are equal. A paged read issues its count and its page as separate
 * queries, so if the tie order changes between them a document is returned on page 1 AND page 2,
 * or skipped by both. `_id` is unique and monotonic, which is what makes the sort total.
 *
 * The constant was already the single authority for `find()`-based reads — and the one repository
 * that pages through the aggregation framework silently ignored it, sorting on `createdAt` alone.
 * Nothing failed, because nothing asserted that the tiebreaker reaches a query.
 *
 * Deliberately syntactic, and deliberately narrow: it reads the `$sort` stages the source declares
 * rather than driving a database, because the property belongs to every pipeline in the tree,
 * including the ones nobody has written yet.
 */

const SOURCE_ROOT = path.join(__dirname, '..', '..', 'src');

/** Keys that make a sort total. `_id` is the primary key; a model may name its own unique field. */
const UNIQUE_KEYS = new Set(['_id', 'id']);

/** The sort constants this repo publishes, all of which already end in a unique key. */
const TOTAL_SORT_CONSTANTS = new Set(['DEFAULT_SORT']);

const listSourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const entryPath = path.join(directory, entry);
        if (statSync(entryPath).isDirectory())
            // A module's own tests live under `src/`, and a fixture pipeline is not a query the
            // application runs.
            return entry === 'tests' ? [] : listSourceFiles(entryPath);
        return entryPath.endsWith('.ts') ? [entryPath] : [];
    });

/**
 * Every `$sort` stage in a file, as it was written.
 *
 * The value is either an inline object literal — no nesting is possible in a sort spec, so a
 * non-greedy match to the first `}` is exact — or an identifier naming a shared constant.
 */
const SORT_STAGE = /\$sort:\s*({[^{}]*}|[$A-Z_a-z][\w$]*)/g;

/** The keys of an inline sort spec, in the order they were declared. */
const sortKeys = (literal: string): string[] =>
    [...literal.matchAll(/([\w$]+)\s*:/g)].map(([, key]) => key);

/** Does this sort spec end in a key that cannot tie? */
const isTotal = (spec: string): boolean => {
    if (!spec.startsWith('{')) return TOTAL_SORT_CONSTANTS.has(spec);
    const keys = sortKeys(spec);
    return keys.length > 0 && UNIQUE_KEYS.has(keys.at(-1)!);
};

interface SortStage {
    file: string;
    spec: string;
}

/** Every `$sort` in a file that also pages, which is what makes the tie order observable. */
const pagedSortStages = (): SortStage[] =>
    listSourceFiles(SOURCE_ROOT).flatMap((filePath) => {
        const source = readFileSync(filePath, 'utf8');
        if (!source.includes('$skip')) return [];
        return [...source.matchAll(SORT_STAGE)].map(([, spec]) => ({
            file: path.relative(SOURCE_ROOT, filePath),
            // Collapsed so a failure message fits on one line.
            spec: spec.replaceAll(/\s+/g, ' ')
        }));
    });

describe('every paged $sort is total', () => {
    it('finds no pipeline paging through a sort that can tie', () => {
        expect(pagedSortStages().filter(({ spec }) => !isTotal(spec))).toEqual([]);
    });

    it('actually finds the pipelines it claims to scan', () => {
        // A canary, as in the audit sweep: an empty result must mean "all total", never "the
        // regex stopped matching". Two repositories page through aggregation pipelines today —
        // `orders` and `products` — and between them declare more than one sort.
        expect(pagedSortStages().length).toBeGreaterThanOrEqual(2);
    });
});
