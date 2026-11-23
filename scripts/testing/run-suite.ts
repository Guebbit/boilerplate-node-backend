#!/usr/bin/env tsx
/**
 * @module
 * Runs one test layer as SEQUENTIAL jest processes (`npm run test:integration` and friends). A
 * wrapper rather than a bare `jest`, for one job no CLI flag does: bound how much memory the
 * layer holds at once on a machine without much.
 *
 * Shards:       jest gives every file a fresh module registry but the PROCESS keeps what it
 *               allocated (~70 MB per file, measured), so a large layer dies on Node's heap
 *               ceiling. `--max-old-space-size` only moves the ceiling; a process that exits every
 *               N files stops the climb, and `--shard` is jest's way to say which N.
 * In band:      layers marked `serialized` below, and any layer narrowed to one worker
 *               (`JEST_WORKERS=1`), run `--runInBand` inside each shard; only those are sharded.
 *               `--workerIdleMemoryLimit` under a worker's baseline restarts it every file, which
 *               is slower than the problem it solves.
 * `--unsharded`: coverage, the JSON report and the randomized-order run each want every pattern in
 *               ONE process and set their own flags, so sharding would cost only repeated `mongod`
 *               boots. It runs the named suites' patterns as one process, keeps {@link SUITES} the
 *               one home for patterns, and still bounds workers unless the caller passed
 *               `--runInBand` or `--maxWorkers`.
 *
 * @see docs/build/weak-machines.md#start-here-—-the-two-mechanisms
 */

import { spawn, spawnSync } from 'node:child_process';
import {
    availableMemoryMb,
    clampShards,
    environmentKnob,
    filesPerShard,
    heapCapMb,
    parseShardSelector,
    processBudgetMb,
    shardCount,
    sliceShards,
    shardTargetMb,
    workerCount
} from './machine-budget';
import { REPO_ROOT } from '../modules-on-disk';
import { SUITES } from './suites';

/**
 * True when invoked with `--unsharded`: run every named suite's patterns as one jest process,
 *  skipping the budget math below entirely — see the module header's "WHY --unsharded" section.
 */
const unsharded = process.argv.includes('--unsharded');

/** Every CLI arg after the flag above is stripped, leaving suite names then jest passthrough. */
const argumentsWithoutFlag = process.argv.slice(2).filter((argument) => argument !== '--unsharded');

/**
 * Splits {@link argumentsWithoutFlag} into the known suite names at the front and everything after
 * as passthrough. A suite name is never flag-shaped, so the first argument that is not a
 * {@link SUITES} key ends the split.
 *
 * @param arguments_ the CLI arguments, `--unsharded` already removed
 * @returns the leading suite names, and the remaining passthrough arguments
 */
const splitSuiteNames = (arguments_: readonly string[]): { names: string[]; rest: string[] } => {
    const boundary = arguments_.findIndex((argument) => !(argument in SUITES));

    return boundary === -1
        ? { names: [...arguments_], rest: [] }
        : { names: arguments_.slice(0, boundary), rest: arguments_.slice(boundary) };
};

/**
 * The flags that bound a jest process's workers.
 *
 * `--runInBand` is what actually puts jest in band. `--workerIdleMemoryLimit` is not passed
 * alongside it, because a run with no worker has nothing to recycle.
 *
 * @param workers how many workers the process may run; 1 means in band
 * @param recycleLimitMb the `--workerIdleMemoryLimit` for a worker, floored by {@link recycleLimitFor}
 * @returns the jest CLI flags
 */
const workerFlags = (workers: number, recycleLimitMb: number): string[] =>
    workers === 1
        ? ['--runInBand']
        : [`--maxWorkers=${workers}`, `--workerIdleMemoryLimit=${recycleLimitMb}MB`];

/**
 * The recycle limit for a worker whose peak is `workerPeakMb`. The `1024` floor keeps a small peak
 * from setting a limit so low jest recycles a worker after nearly every file — the failure mode
 * the module header's "WHY IN BAND" section describes.
 *
 * @param workerPeakMb measured peak cost of one worker
 * @returns the limit in MB
 */
const recycleLimitFor = (workerPeakMb: number): number => Math.max(1024, workerPeakMb);

/** The layer name(s) from argv, and everything after them, passed through to jest untouched. */
const { names: suiteNames, rest: passthrough } = splitSuiteNames(argumentsWithoutFlag);

// Exit 2 (usage error) when the first argument names no known suite.
if (suiteNames.length === 0) {
    console.error(
        `[test] unknown suite ${JSON.stringify(argumentsWithoutFlag[0])} — ` +
            `expected one of: ${Object.keys(SUITES).join(', ')}`
    );
    process.exit(2);
}

// `--unsharded`: one jest process for every named suite, then exit with its status.
if (unsharded) {
    /**
     * One process, every named suite's patterns at once — no shard/heap math, no `suite` lookup:
     * the caller (the JSON report, randomized order) already chose its own jest flags.
     */
    const patterns = suiteNames.flatMap((name) => SUITES[name].patterns);

    // Worker-bounded like a sharded run, unless the caller already chose in band or a count.
    const callerBounded = passthrough.some(
        (argument) => argument === '--runInBand' || argument.startsWith('--maxWorkers')
    );
    const parallelPeaks = suiteNames.flatMap((name) => {
        const named = SUITES[name];
        return named.serialized ? [] : [named.workerPeakMb];
    });
    const peakMb = Math.max(0, ...parallelPeaks);
    const unshardedFlags = callerBounded
        ? []
        : workerFlags(
              parallelPeaks.length === 0
                  ? 1
                  : workerCount({
                        peakMb,
                        cpuReserve: 2,
                        override: environmentKnob('JEST_WORKERS')
                    }),
              recycleLimitFor(peakMb)
          );

    /**
     * node:child_process `spawnSync`: run jest to completion, connected to this process's own
     * stdio (`inherit`) so its live output and exit code both reach the caller unchanged.
     * https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options
     */
    const result = spawnSync('npx', ['jest', ...patterns, ...unshardedFlags, ...passthrough], {
        cwd: REPO_ROOT,
        stdio: 'inherit'
    });

    process.exit(result.status ?? 1);
}

// Sharded mode runs exactly one suite; combining needs `--unsharded`.
if (suiteNames.length > 1) {
    console.error(
        `[test] sharded mode takes exactly one suite — pass --unsharded to combine ` +
            suiteNames.join(', ')
    );
    process.exit(2);
}

/** The single layer name a sharded run always takes — {@link suiteNames} has exactly one here. */
const [suiteName] = suiteNames;

/**
 * This run's {@link Suite} — guaranteed present, since {@link splitSuiteNames} only collects
 *  known keys.
 */
const suite = SUITES[suiteName];

/**
 * How many test files this layer currently matches.
 *
 * Asked of jest rather than counted with a glob, so the answer comes from the same resolver that
 * will run them — `testPathIgnorePatterns` included, which is what keeps `tests/replicas` out.
 *
 * @returns the file count, or 0 when jest could not answer
 */
const countTestFiles = (): number => {
    /**
     * node:child_process `spawnSync`: run jest to completion and capture its stdout.
     * `--listTests` prints one file path per line instead of running anything;
     * `encoding: 'utf8'` decodes `stdout` to a string instead of a `Buffer`.
     * https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options
     */
    const listed = spawnSync('npx', ['jest', ...suite.patterns, '--listTests'], {
        cwd: REPO_ROOT,
        encoding: 'utf8'
    });

    /**
     * A spawn that never started reports through `error` and has no usable stdout — the 0 this
     * returns for that case is the documented answer above, not a count of zero files.
     */
    if (listed.error) return 0;

    return listed.stdout.split('\n').filter((line) => line.trimEnd().endsWith('.test.ts')).length;
};

/** This layer's spending limit, from `JEST_PROCESS_BUDGET_MB` or the machine's free memory. */
const budgetMb = processBudgetMb(environmentKnob('JEST_PROCESS_BUDGET_MB'));

/** The budget above, capped by the guard rail against an idle machine over-promising a shard. */
const targetMb = shardTargetMb(budgetMb);

/** How many files one shard may hold before its retention reaches {@link targetMb}. */
const perShard = filesPerShard(targetMb);

/** How many files this layer's patterns actually match, right now. */
const fileCount = countTestFiles();

/** How many parallel workers a non-serialized layer gets; always 1 for a serialized one. */
const workers = suite.serialized
    ? 1
    : workerCount({
          peakMb: suite.workerPeakMb,
          cpuReserve: 2,
          override: environmentKnob('JEST_WORKERS')
      });

/**
 * Whether this layer runs its files in band, in the jest process itself.
 *
 * A serialized layer always does. A layer narrowed to ONE worker does too, and must: jest takes
 * its own implicit in-band path only while `workerIdleMemoryLimit` is undefined, and a CLI
 * `--maxWorkers=1` cannot unset what the config sets for more workers — so `--runInBand` is passed.
 * Left as one worker under a recycle ceiling, a 419-file unit run reported nothing for 87 minutes.
 */
const inBand = suite.serialized || workers === 1;

/** The raw `JEST_SHARDS` override, if the operator set one — clamped below before use. */
const shardsOverride = environmentKnob('JEST_SHARDS');

/**
 * `JEST_SHARD=<i>/<n>`, set by a CI matrix job: this process runs slice `i` of `n` and nothing else.
 * It fixes the slice count, so it wins over {@link shardsOverride} and the memory-driven count.
 */
const selector = parseShardSelector(process.env.JEST_SHARD);

/**
 * How many sequential jest processes this layer needs.
 *
 * Only an IN-BAND layer is sharded.
 *
 * Per-file retention accumulates in whichever process executes the files. For a parallel layer
 * that is a worker, which `--workerIdleMemoryLimit` already recycles once it grows — sharding it
 * too would pay a fresh `mongod` boot per shard for a problem the recycling already solves.
 * In band there is no worker, so the shard boundary is the only reset there is.
 *
 * `JEST_SHARDS` still overrides this for a parallel layer, for whoever needs that knob anyway,
 * clamped to the layer's own file count: a shard beyond it runs empty and jest exits non-zero.
 */
const memoryShards = shardsOverride
    ? clampShards(shardsOverride, fileCount)
    : inBand
      ? shardCount(fileCount, perShard)
      : 1;

/**
 * A matrix job's share of {@link memoryShards}: the total jest shard count and the ones this job runs.
 * Without `JEST_SHARD` that is every shard, in order.
 */
const plan = selector
    ? sliceShards(selector, memoryShards, fileCount)
    : { total: memoryShards, mine: Array.from({ length: memoryShards }, (_, i) => i + 1) };

/** The total jest shard count; `--shard=k/shards` is passed when it is above one. */
const shards = plan.total;

/**
 * `--workerIdleMemoryLimit` for a parallel layer's worker; meaningless (and unused) in band,
 *  which has no worker to recycle. The `suite.serialized` test stays: it carries the narrowing
 *  that makes `workerPeakMb` reachable.
 */
const recycleLimitMb = recycleLimitFor(suite.serialized ? 0 : suite.workerPeakMb);

/**
 * `--max-old-space-size` for one spawned process.
 *
 * An in-band layer runs one process and gets the shard target whole. A parallel layer
 * runs `workers` of these AT ONCE, so each gets only its share of the unclamped budget — handing
 * every worker the full {@link targetMb} would let `workers` of them jointly claim `workers` times
 * what the machine actually has. Floored at one above {@link recycleLimitMb} so the recycle limit
 * always fires before a worker would hit its own heap ceiling, never after.
 */
const heapMb = inBand
    ? heapCapMb(targetMb)
    : Math.max(recycleLimitMb + 1, heapCapMb(budgetMb, workers));

/** The flags that bound ONE shard. */
const boundingFlags = inBand ? ['--runInBand'] : workerFlags(workers, recycleLimitMb);

/**
 * Runs one shard to completion.
 *
 * @param shard the 1-based shard number
 * @returns that jest's exit code, with 1 standing in for a signal death
 */
const runShard = (shard: number): Promise<number> =>
    new Promise((resolve) => {
        const shardFlags = shards > 1 ? [`--shard=${shard}/${shards}`] : [];

        /**
         * node:child_process `spawn`: run jest asynchronously, without capturing its output.
         * `stdio: 'inherit'` connects the child's stdin/stdout/stderr straight to this process's
         * own, so jest's own progress output reaches the terminal live.
         * https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
         */
        const child = spawn(
            'npx',
            ['jest', ...suite.patterns, ...shardFlags, ...boundingFlags, ...passthrough],
            {
                cwd: REPO_ROOT,
                stdio: 'inherit',
                env: {
                    ...process.env,
                    /**
                     * Pinned per shard rather than left to Node, which derives its ceiling from
                     * TOTAL RAM and so hands a weak machine a limit it cannot honour.
                     */
                    NODE_OPTIONS:
                        `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=${heapMb}`.trim()
                }
            }
        );

        child.on('close', (code) => resolve(code ?? 1));
    });

/** Runs every shard for this layer in turn, and fails the whole run on the first bad exit. */
const main = async () => {
    console.log(
        `[test] ${suiteName}: ${fileCount} files in ${shards} shard(s) — ` +
            `${suite.serialized ? 'in band' : inBand ? 'in band, narrowed to 1 worker' : `${workers} workers`}, ` +
            `heap=${heapMb} MB, ` +
            // Only meaningful where it decided something: an unsharded layer did not consult it.
            (shards > 1 ? `${perShard} files/shard, ` : '') +
            `${availableMemoryMb()} MB available`
    );

    for (const shard of plan.mine) {
        if (shards > 1) console.log(`\n[test] ${suiteName}: shard ${shard}/${shards}`);

        /**
         * Sequential on purpose: the whole point is that only one shard's memory is live at a time,
         * so this await inside a loop is the feature rather than an oversight.
         */
        const code = await runShard(shard);

        if (code === 0) {
            continue;
        }

        console.error(`\n[test] ${suiteName}: shard ${shard}/${shards} failed (exit ${code})`);
        process.exit(code);
    }

    console.log(`\n[test] ${suiteName}: ${plan.mine.length} of ${shards} shard(s) passed`);
};

// Entry point: a rejection prints the error and exits 1.
main().catch((error: unknown) => {
    console.error(`[test] ${suiteName} failed to run:`, error);
    process.exit(1);
});
