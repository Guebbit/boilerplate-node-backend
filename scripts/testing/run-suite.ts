#!/usr/bin/env tsx
/**
 * @module
 * Runs one test layer as a series of SEQUENTIAL jest processes — `npm run test:integration` and
 * friends. A wrapper rather than a bare `jest`, for one job a CLI flag cannot do: bound how much
 * memory the layer may hold at once on a machine that does not have much.
 *
 * ── WHY SHARDS AND NOT JUST A BIGGER HEAP ────────────────────────────────────────────────────────
 * Jest gives every test file a fresh module registry but the PROCESS keeps what that registry
 * allocated — ~70 MB per file, measured. Over the integration layer's 75 files that is ~5 GB of
 * retention in one process, and the run dies on Node's heap ceiling long before the last file.
 * `--max-old-space-size` only moves the ceiling; it does not stop the climb. A process that exits
 * every N files does, and `--shard` is jest's own way to say which N.
 *
 * ── WHY IN BAND INSIDE A SHARD ───────────────────────────────────────────────────────────────────
 * The layers listed as `serialized` below kept `--runInBand` for a reason that still holds, and a
 * measured one: `--workerIdleMemoryLimit` set below a worker's steady-state baseline restarts that
 * worker after every single file, which is slower than the problem it solves.
 *
 * See: docs/tools/weak-machines.md
 */

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import {
    availableMemoryMb,
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
 * `serialized` carries the old `--runInBand`. It is a property of the layer, not of the machine:
 * these suites share one in-memory mongod and were written against one-file-at-a-time execution.
 */
interface Suite {
    /** Path patterns handed to jest, exactly as the npm script used to spell them. */
    readonly patterns: readonly string[];
    /** One file at a time inside a shard, preserving the layer's original `--runInBand`. */
    readonly serialized: boolean;
    /** Measured peak cost of one parallel worker, MB. Unused when `serialized`. */
    readonly workerPeakMb: number;
}

/**
 * The layers this runner knows, keyed by the name its npm script passes.
 *
 * `unit` and `cross-cutting` were already parallel and stay parallel — nothing here changes what
 * they were doing, only where the worker count comes from.
 */
const SUITES: Record<string, Suite> = {
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
        serialized: true,
        workerPeakMb: 1400
    },
    contract: {
        patterns: ['tests/contract', 'src/modules/.*/tests/contract'],
        serialized: true,
        workerPeakMb: 1400
    },
    fuzz: {
        patterns: ['tests/fuzz'],
        serialized: true,
        workerPeakMb: 1400
    }
};

const [suiteName, ...passthrough] = process.argv.slice(2);
const suite = suiteName ? SUITES[suiteName] : undefined;

if (!suite) {
    console.error(
        `[test] unknown suite ${JSON.stringify(suiteName)} — ` +
            `expected one of: ${Object.keys(SUITES).join(', ')}`
    );
    process.exit(2);
}

/**
 * How many test files this layer currently matches.
 *
 * Asked of jest rather than counted with a glob, so the answer comes from the same resolver that
 * will run them — `testPathIgnorePatterns` included, which is what keeps `tests/cluster` out.
 *
 * @returns the file count, or 0 when jest could not answer
 */
const countTestFiles = (): number => {
    const listed = spawnSync('npx', ['jest', ...suite.patterns, '--listTests'], {
        cwd: REPO_ROOT,
        encoding: 'utf8'
    });

    // A spawn that never started reports through `error` and has no usable stdout — the 0 this
    // returns for that case is the documented answer above, not a count of zero files.
    if (listed.error) return 0;

    return listed.stdout.split('\n').filter((line) => line.trim().endsWith('.test.ts')).length;
};

const budgetMb = processBudgetMb(environmentKnob('JEST_PROCESS_BUDGET_MB'));
const targetMb = shardTargetMb(budgetMb);
const heapMb = heapCapMb(targetMb);
const perShard = filesPerShard(targetMb);
const fileCount = countTestFiles();
/**
 * How many sequential jest processes this layer needs.
 *
 * Only a SERIALIZED layer is sharded. Per-file retention accumulates in whichever process executes
 * the files, and for a parallel layer that is a worker — which `--workerIdleMemoryLimit` already
 * recycles once it grows. Sharding those as well would pay a fresh `mongod` boot per shard to solve
 * a problem the recycling has already solved.
 */
const shards = suite.serialized
    ? (environmentKnob('JEST_SHARDS') ?? shardCount(fileCount, perShard))
    : (environmentKnob('JEST_SHARDS') ?? 1);

const workers = suite.serialized
    ? 1
    : workerCount({
          peakMb: suite.workerPeakMb,
          cpuReserve: 2,
          override: environmentKnob('JEST_WORKERS')
      });

/**
 * The flags that bound ONE shard.
 *
 * `--workerIdleMemoryLimit` is deliberately absent for a serialized layer: with one worker jest
 * runs in band, where there is no worker to recycle and the flag is silently inert.
 */
const boundingFlags = suite.serialized
    ? ['--runInBand']
    : [
          `--maxWorkers=${workers}`,
          `--workerIdleMemoryLimit=${Math.max(1024, suite.workerPeakMb)}MB`
      ];

/**
 * Runs one shard to completion.
 *
 * @param shard the 1-based shard number
 * @returns that jest's exit code, with 1 standing in for a signal death
 */
const runShard = (shard: number): Promise<number> =>
    new Promise((resolve) => {
        const shardFlags = shards > 1 ? [`--shard=${shard}/${shards}`] : [];

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
