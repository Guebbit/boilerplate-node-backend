#!/usr/bin/env tsx
/**
 * @module
 * Runs one test layer as a series of SEQUENTIAL jest processes — `npm run test:integration` and
 * friends. A wrapper rather than a bare `jest`, for one job a CLI flag cannot do: bound how much
 * memory the layer may hold at once on a machine that does not have much.
 *
 * ── WHY SHARDS AND NOT JUST A BIGGER HEAP ────────────────────────────────────────────────────────
 * Jest gives every test file a fresh module registry but the PROCESS keeps what that registry
 * allocated — ~70 MB per file, measured. Multiplied across the integration layer's own file
 * count, that is several GB of retention in one process, and the run dies on Node's heap
 * ceiling long before the last file.
 * `--max-old-space-size` only moves the ceiling; it does not stop the climb. A process that exits
 * every N files does, and `--shard` is jest's own way to say which N.
 *
 * ── WHY IN BAND INSIDE A SHARD ───────────────────────────────────────────────────────────────────
 * The layers marked `serialized` below run `--runInBand` inside each shard.
 * `--workerIdleMemoryLimit` set below a worker's steady-state baseline restarts it after every
 * single file — measured, and slower than the retention problem it exists to solve.
 *
 * ── WHY --unsharded EXISTS TOO ────────────────────────────────────────────────────────────────────
 * Coverage, the JSON report and the randomized-order run each want every pattern this file knows
 * about in ONE jest process — they already picked their own flags and heap, sharding would only
 * cost them a repeated `mongod` boot. `--unsharded` skips the budget math below entirely and runs
 * the named suites' patterns as one process, so {@link SUITES} stays the one place a suite's
 * patterns are written down instead of copied into `package.json`.
 *
 * See: docs/tools/weak-machines.md
 */

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import {
    availableMemoryMb,
    clampShards,
    environmentKnob,
    filesPerShard,
    heapCapMb,
    processBudgetMb,
    shardCount,
    shardTargetMb,
    workerCount
} from './machine-budget';

/** The repo root — the working directory every spawned jest inherits. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * One test layer: the jest path patterns it matches, and whether its files may run side by side.
 *
 * `serialized` is a property of the layer, not the machine: these suites share one in-memory
 * mongod, so their files cannot run side by side regardless of how much memory is free.
 */
type Suite =
    | {
          /** Path patterns handed to jest, in the same form each npm script passes them. */
          readonly patterns: readonly string[];
          /** One file at a time inside a shard: these suites share one in-memory mongod. */
          readonly serialized: true;
      }
    | {
          readonly patterns: readonly string[];
          readonly serialized: false;
          /** Measured peak cost of one parallel worker, MB — meaningless once `serialized`, so
           *  the type only carries it for a layer that actually runs workers. */
          readonly workerPeakMb: number;
      };

/**
 * The layers this runner knows, keyed by the name its npm script passes.
 *
 * `unit` and `cross-cutting` run in parallel; only their worker count comes from this file.
 * Exported so a `package.json` script needing several layers unsharded (coverage, the JSON
 * report, randomized order) can name them instead of hand-copying their jest patterns.
 */
export const SUITES: Record<string, Suite> = {
    unit: {
        patterns: ['tests/unit', 'src/modules/.*/tests/unit'],
        serialized: false,
        workerPeakMb: 905
    },
    'cross-cutting': {
        patterns: ['tests/cross-cutting'],
        serialized: false,
        workerPeakMb: 905
    },
    integration: {
        patterns: ['tests/integration', 'src/modules/.*/tests/integration'],
        serialized: true
    },
    contract: {
        patterns: ['tests/contract', 'src/modules/.*/tests/contract'],
        serialized: true
    },
    fuzz: {
        patterns: ['tests/fuzz', 'src/modules/.*/tests/fuzz'],
        serialized: true
    }
};

/** True when invoked with `--unsharded`: run every named suite's patterns as one jest process,
 *  skipping the budget math below entirely — see the module header's "WHY --unsharded" section. */
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

/** The layer name(s) from argv, and everything after them, passed through to jest untouched. */
const { names: suiteNames, rest: passthrough } = splitSuiteNames(argumentsWithoutFlag);

if (suiteNames.length === 0) {
    console.error(
        `[test] unknown suite ${JSON.stringify(argumentsWithoutFlag[0])} — ` +
            `expected one of: ${Object.keys(SUITES).join(', ')}`
    );
    process.exit(2);
}

if (unsharded) {
    // One process, every named suite's patterns at once — no shard/heap math, no `suite` lookup:
    // the caller (coverage, the JSON report, randomized order) already chose its own jest flags.
    const patterns = suiteNames.flatMap((name) => SUITES[name].patterns);

    /**
     * node:child_process `spawnSync`: run jest to completion, connected to this process's own
     * stdio (`inherit`) so its live output and exit code both reach the caller unchanged.
     * https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options
     */
    const result = spawnSync('npx', ['jest', ...patterns, ...passthrough], {
        cwd: REPO_ROOT,
        stdio: 'inherit'
    });

    process.exit(result.status ?? 1);
}

if (suiteNames.length > 1) {
    console.error(
        `[test] sharded mode takes exactly one suite — pass --unsharded to combine ` +
            suiteNames.join(', ')
    );
    process.exit(2);
}

/** The single layer name a sharded run always takes — {@link suiteNames} has exactly one here. */
const [suiteName] = suiteNames;

/** This run's {@link Suite} — guaranteed present, since {@link splitSuiteNames} only collects
 *  known keys. */
const suite = SUITES[suiteName];

/**
 * How many test files this layer currently matches.
 *
 * Asked of jest rather than counted with a glob, so the answer comes from the same resolver that
 * will run them — `testPathIgnorePatterns` included, which is what keeps `tests/cluster` out.
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

    // A spawn that never started reports through `error` and has no usable stdout — the 0 this
    // returns for that case is the documented answer above, not a count of zero files.
    if (listed.error) return 0;

    return listed.stdout.split('\n').filter((line) => line.trim().endsWith('.test.ts')).length;
};

/** This layer's spending limit, from `JEST_PROCESS_BUDGET_MB` or the machine's free memory. */
const budgetMb = processBudgetMb(environmentKnob('JEST_PROCESS_BUDGET_MB'));

/** The budget above, capped by the guard rail against an idle machine over-promising a shard. */
const targetMb = shardTargetMb(budgetMb);

/** How many files one shard may hold before its retention reaches {@link targetMb}. */
const perShard = filesPerShard(targetMb);

/** How many files this layer's patterns actually match, right now. */
const fileCount = countTestFiles();

/** The raw `JEST_SHARDS` override, if the operator set one — clamped below before use. */
const shardsOverride = environmentKnob('JEST_SHARDS');

/**
 * How many sequential jest processes this layer needs.
 *
 * By default only a SERIALIZED layer is sharded. Per-file retention accumulates in whichever
 * process executes the files, and for a parallel layer that is a worker — which
 * `--workerIdleMemoryLimit` already recycles once it grows, so sharding it too would only pay a
 * fresh `mongod` boot per shard for a problem the recycling already solves. `JEST_SHARDS` still
 * overrides this for a parallel layer, for whoever needs that knob anyway — clamped to the layer's
 * own file count, since a shard beyond it would run empty and jest exits non-zero on that.
 */
const shards = shardsOverride
    ? clampShards(shardsOverride, fileCount)
    : suite.serialized
      ? shardCount(fileCount, perShard)
      : 1;

/** How many parallel workers a non-serialized layer gets; always 1 for a serialized one. */
const workers = suite.serialized
    ? 1
    : workerCount({
          peakMb: suite.workerPeakMb,
          cpuReserve: 2,
          override: environmentKnob('JEST_WORKERS')
      });

/** `--workerIdleMemoryLimit` for a parallel layer's worker; meaningless (and unused) for a
 *  serialized one, which has no worker to recycle. */
const recycleLimitMb = Math.max(1024, suite.serialized ? 0 : suite.workerPeakMb);

/**
 * `--max-old-space-size` for one spawned process.
 *
 * A serialized layer runs one in-band process and gets the shard target whole. A parallel layer
 * runs `workers` of these AT ONCE, so each gets only its share of the unclamped budget — handing
 * every worker the full {@link targetMb} would let `workers` of them jointly claim `workers` times
 * what the machine actually has. Floored at one above {@link recycleLimitMb} so the recycle limit
 * always fires before a worker would hit its own heap ceiling, never after.
 */
const heapMb = suite.serialized
    ? heapCapMb(targetMb)
    : Math.max(recycleLimitMb + 1, heapCapMb(budgetMb, workers));

/**
 * The flags that bound ONE shard.
 *
 * `--workerIdleMemoryLimit` is deliberately absent for a serialized layer: with one worker jest
 * runs in band, where there is no worker to recycle and the flag is silently inert. The `1024`
 * floor inside {@link recycleLimitMb} keeps a small `workerPeakMb` from setting a limit so low jest
 * recycles a worker after nearly every file — the failure mode the module header's "WHY IN BAND"
 * section describes.
 */
const boundingFlags = suite.serialized
    ? ['--runInBand']
    : [`--maxWorkers=${workers}`, `--workerIdleMemoryLimit=${recycleLimitMb}MB`];

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
                    // Pinned per shard rather than left to Node, which derives its ceiling from
                    // TOTAL RAM and so hands a weak machine a limit it cannot honour.
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
            `${suite.serialized ? 'in band' : `${workers} workers`}, ` +
            `heap=${heapMb} MB, ` +
            // Only meaningful where it decided something: an unsharded layer did not consult it.
            (shards > 1 ? `${perShard} files/shard, ` : '') +
            `${availableMemoryMb()} MB available`
    );

    for (let shard = 1; shard <= shards; shard += 1) {
        if (shards > 1) console.log(`\n[test] ${suiteName}: shard ${shard}/${shards}`);

        // Sequential on purpose: the whole point is that only one shard's memory is live at a time,
        // so this await inside a loop is the feature rather than an oversight.
        const code = await runShard(shard);

        if (code !== 0) {
            console.error(`\n[test] ${suiteName}: shard ${shard}/${shards} failed (exit ${code})`);
            process.exit(code);
        }
    }

    console.log(`\n[test] ${suiteName}: all ${shards} shard(s) passed`);
};

main().catch((error: unknown) => {
    console.error(`[test] ${suiteName} failed to run:`, error);
    process.exit(1);
});
