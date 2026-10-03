/**
 * @module
 * A Stryker ignorer that narrows one run to a line SLICE of a file — how the GitHub sweep splits a
 * file too slow for one 6-hour job without losing or changing a single mutant.
 *
 * Why not `--mutate file:10-50`: Stryker then mutates only nodes wholly INSIDE the range, so a node
 *   crossing a slice edge (a function body, a schema object) is mutated by no slice at all.
 * What this does:  ignores every subtree that does not TOUCH the slice. A node crossing an edge
 *   touches both neighbours, so both test it, and `merge.ts` keeps one result.
 * Inert:  without `MUTATION_SLICE` it ignores nothing.
 * Loaded: by Node's own type stripping, not tsx — so no imports, and erasable syntax only.
 *
 * See: docs/tools/mutation-testing.md#the-github-sweep
 */

/** An inclusive, 1-based line range of one file. */
export interface LineSlice {
    from: number;
    to: number;
}

/** As much of Babel's `SourceLocation` as this reads. Lines are 1-based, like {@link LineSlice}. */
interface NodeLocation {
    start: { line: number };
    end: { line: number };
}

/** As much of the Babel `NodePath` Stryker hands an ignorer as this reads. */
export interface IgnorerPath {
    node: { loc?: NodeLocation | null };
}

/**
 * The `statusReason` Stryker records on a mutant this ignorer skipped — how `merge.ts` tells
 * "another slice tested this" apart from a `// Stryker disable` comment.
 */
export const SLICE_IGNORE_REASON = 'Outside this CI slice';

/**
 * Reads `MUTATION_SLICE` (`"120-240"`).
 *
 * @param raw the variable's value; empty or unset means "no slice"
 * @throws {Error} on anything else that is not a valid range — a typo must not silently mutate the
 *   whole file inside a job sized for a fraction of it
 */
export const parseSlice = (raw: string | undefined): LineSlice | undefined => {
    if (!raw) return undefined;

    const match = /^(\d+)-(\d+)$/.exec(raw.trim());
    const from = Number(match?.[1]);
    const to = Number(match?.[2]);
    if (!match || from < 1 || to < from)
        throw new Error(`MUTATION_SLICE must look like "120-240", got "${raw}"`);

    return { from, to };
};

/**
 * Whether a node lies wholly outside the slice. Touching it by one line is enough to stay in.
 *
 * @param location the node's location; a node without one (synthesised) is never outside
 */
export const outsideSlice = (
    location: NodeLocation | null | undefined,
    slice: LineSlice
): boolean => !!location && (location.end.line < slice.from || location.start.line > slice.to);

/** This process's slice, read once: the ignorer below runs for every node of every file. */
const activeSlice = parseSlice(process.env.MUTATION_SLICE);

/**
 * The plugin Stryker loads through `appendPlugins`, enabled by `ignorers: ['ci-slice']`.
 *
 * Written as the plain object `declareValuePlugin(PluginKind.Ignore, …)` returns, so this file
 * needs no import from `@stryker-mutator/api`. Stryker skips a whole subtree once `shouldIgnore`
 * answers for its root — which is why "does not touch the slice" is the only safe question.
 * https://stryker-mutator.io/docs/stryker-js/disable-mutants/#using-an-ignore-plugin
 */
export const strykerPlugins = [
    {
        kind: 'Ignore',
        name: 'ci-slice',
        value: {
            shouldIgnore: (path: IgnorerPath): string | undefined =>
                activeSlice && outsideSlice(path.node.loc, activeSlice)
                    ? SLICE_IGNORE_REASON
                    : undefined
        }
    }
];
