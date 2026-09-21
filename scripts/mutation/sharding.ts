/**
 * The weekly full-sweep matrix, built by LINE COUNT rather than by module name.
 *
 * A hand-copied module list drifts the moment a module is added — `src/infrastructure`,
 * `src/kernel`, `webhooks`, `api-keys` and `antibot` went unmeasured for a month while sitting
 * right in `stryker.json`'s own `mutate` list, because `--mutate` on the CI command line
 * overrode the config and nothing kept the two in sync. `scripts/mutation/shard-plan.ts` walks
 * the real scope itself, so a new module is in the matrix the next time this runs, with no edit
 * here.
 *
 * See docs/tools/mutation-testing.md#the-three-commands for the shape this feeds.
 */

/** One shard of the mutate scope: a name for the CI matrix, and its `--mutate` file list. */
export interface Shard {
    name: string;
    mutate: string;
    lines: number;
}

/**
 * Target lines per shard.
 *
 * Re-derived 2026-09-21 from a REAL shard, not the single-file extrapolation this constant used
 * to rest on: `shard-00` (1300 lines, 346 mutants) measured **219 minutes at `--concurrency 2`** —
 * ~38s/mutant, not the ~7.1s/mutant `observability` alone had suggested. At `--concurrency 1` the
 * gap was worse than a clean 2x: every other shard in the full sweep still hadn't finished after
 * 350 minutes (2026-09-21's CI run — all 35 remaining shards hit that ceiling simultaneously).
 * `--concurrency 2` is back for exactly that reason; see the workflow's own comment.
 *
 * 600 lines, at the measured ~38s/mutant, budgets to roughly 100 minutes per shard — real margin
 * under `timeout-minutes: 350`, and a shard half this size relates roughly half as much of the
 * integration suite through `enableFindRelatedTests`, which is what actually drove the `bson`
 * OOMs (`docs/tools/mutation-testing.md#worker-heap-cap`), not concurrency by itself. Re-derive
 * both numbers together once a few weeks of real shard timings exist at THIS size — this constant
 * and the workflow's `timeout-minutes` are coupled and nothing checks that they still agree.
 */
export const TARGET_LINES_PER_SHARD = 600;

/**
 * Largest-file-first bin packing.
 *
 * Sort files biggest first, always drop the next one into whichever bin currently holds the
 * least — the standard greedy approximation to balancing N items into K bins, without solving the
 * NP-hard exact-partition problem for what is, after all, just a scheduling heuristic.
 *
 * @param targetLines lines per shard, defaulting to the CI-derived {@link TARGET_LINES_PER_SHARD}.
 *   A local sweep may want fewer, bigger shards: every shard pays the whole-suite dry run again,
 *   and that overhead is per shard, not per mutant.
 */
export const packIntoShards = (
    files: readonly { file: string; lines: number }[],
    targetLines: number = TARGET_LINES_PER_SHARD
): Shard[] => {
    const totalLines = files.reduce((sum, { lines }) => sum + lines, 0);
    const shardCount = Math.max(1, Math.ceil(totalLines / targetLines));
    const bins: { files: string[]; lines: number }[] = Array.from({ length: shardCount }, () => ({
        files: [],
        lines: 0
    }));

    for (const { file, lines } of files.toSorted((a, b) => b.lines - a.lines)) {
        let smallest = bins[0];
        for (const bin of bins) if (bin.lines < smallest.lines) smallest = bin;

        smallest.files.push(file);
        smallest.lines += lines;
    }

    return bins.map((bin, index) => ({
        name: `shard-${String(index).padStart(2, '0')}`,
        mutate: bin.files.toSorted().join(','),
        lines: bin.lines
    }));
};
