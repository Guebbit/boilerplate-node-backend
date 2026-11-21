/**
 * @module
 * One Stryker invocation, sized for THIS machine — the half every mutation entry point shares.
 *
 * Owns:   concurrency, the per-worker heap cap, the scratch sweep, and the OOM-loop abort.
 * Why:    both entry points (`run-diff`, `run-shards`) need all four, and one that called
 *         `npx stryker` directly would silently run without the heap cap — which is the one setting
 *         a run on a 30 GB machine cannot do without.
 *
 * @see docs/build/mutation-testing.md#worker-heap-cap
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { availableMemoryMb, environmentKnob } from '../testing/machine-budget';
import { REPO_ROOT } from '../modules-on-disk';

/**
 * Measured peak RSS of one Stryker/jest worker during a mutation run, rounded up. The ceiling for this run is RAM,
 * not cores, which is why the default below is computed from it instead of copying `jest`'s
 * CPU-only heuristic.
 *
 * @see docs/build/mutation-testing.md#the-worker-pool-multiplication
 */
const STRYKER_WORKER_PEAK_MB = 2900;

/**
 * Headroom left unclaimed for the OS, the docker stack and an editor — double
 * `scripts/testing/machine-budget.ts`'s own `OS_RESERVE_MB` (2048), deliberately: that number
 * reserves for a single jest process's neighbours, while a mutation run's own orchestrator (the
 * Stryker process itself, on top of every worker `resolveConcurrency` below sizes) is a real,
 * additional consumer of the same machine that plain test running never has to account for.
 */
const STRYKER_OS_RESERVE_MB = 4096;

/**
 * Where the mutation run's jest instances keep their in-memory Mongo data directories. Outside the
 * sandbox, deliberately, and its own folder rather than `tmp/test/` (a plain `npm test` run's) or
 * all of `tmp/` — the sweep below deletes it wholesale before every run, so it must not hold a
 * live jest run's database, nor `tmp/reports/` (this same run's own incremental cache).
 */
const TEST_TMP_BASE = path.join(REPO_ROOT, 'tmp', 'test-mutation');

/**
 * How many restarts, inside how long, count as the loop rather than bad luck.
 *
 * A single restart is survivable — a genuinely heavy suite can trip the ceiling once. Six inside
 * ten minutes is not a heavy suite, it is a run that will not converge.
 */
const OOM_LIMIT = 6;

/** The window {@link OOM_LIMIT} is counted in: ten minutes, in milliseconds. */
const OOM_WINDOW_MS = 10 * 60 * 1000;

/**
 * How many Stryker workers to run.
 *
 * `STRYKER_CONCURRENCY` always wins. Unset, the safe number is computed from this machine rather
 * than left to `stryker.json`'s committed `concurrency: 4` — a number sized for a
 * contributor's laptop, not necessarily this one.
 *
 * @returns `STRYKER_CONCURRENCY` when set, otherwise the lower of `logical CPUs - 1` and free
 *   memory (`MemAvailable`, not total) divided by one worker's peak RSS
 *
 * @see docs/build/mutation-testing.md#the-worker-pool-multiplication
 */
const resolveConcurrency = (): number => {
    const configured = environmentKnob('STRYKER_CONCURRENCY');
    if (configured) return configured;

    const cpuCap = os.cpus().length - 1;
    const ramCap = Math.floor(
        (availableMemoryMb() - STRYKER_OS_RESERVE_MB) / STRYKER_WORKER_PEAK_MB
    );
    // At least one, or a single-core, low-memory machine would compute zero and run nothing.
    return Math.max(1, Math.min(cpuCap, ramCap));
};

/** How a Stryker run ended: its exit code, and whether this wrapper is what stopped it. */
export interface StrykerOutcome {
    /** Stryker's exit code. */
    code: number;
    /** Whether this wrapper stopped the run because memory ran out. */
    abortedForOom: boolean;
}

/**
 * Runs Stryker once, with this machine's settings applied and the OOM loop watched for.
 *
 * Takes:   `args`: CLI arguments appended verbatim after `run` — a config path, `--mutate`,
 *          `--force`. `label`: printed alongside the settings, so one line of a long log says
 *          which piece this is.
 *
 * @returns the child's exit code, and whether the OOM guard is what ended it
 */
export const runStryker = ({
    args,
    label
}: {
    args: readonly string[];
    label?: string;
}): Promise<StrykerOutcome> => {
    const concurrency = resolveConcurrency();
    const heapMb = environmentKnob('STRYKER_WORKER_HEAP_MB');
    const passedConcurrency = args.some((argument) => argument.startsWith('--concurrency'));

    /**
     * `--expose-gc` lets the test environment collect after each file, which a single-process dry
     * run needs to finish.
     *
     * `--max-old-space-size` raises V8's default, a flat ~4.2 GB here rather than a share of the
     * machine — a worker wanting more dies in the first minute. It cannot bound memory held outside
     * the heap, such as `bson`'s buffers.
     *
     * `...process.env`, never `.env` merged in first: a merged `.env` is part of the parent
     * environment every spawned jest inherits, so it would bypass `DOTENV_PATH` (`jest.config.js`)
     * and its Redis URLs would reach every suite, which then fail open against a Redis that is not
     * reachable from here — see `environmentKnob`'s own reasoning in `machine-budget.ts`.
     *
     * @see docs/build/mutation-testing.md#collect-after-each-file
     * @see docs/build/mutation-testing.md#worker-heap-cap
     */
    const childEnvironment = {
        ...process.env,
        NODE_TEST_TMP_BASE: TEST_TMP_BASE,
        NODE_OPTIONS: [
            process.env.NODE_OPTIONS,
            '--expose-gc',
            heapMb ? `--max-old-space-size=${heapMb}` : undefined
        ]
            .filter(Boolean)
            .join(' ')
    };

    /**
     * The scratch root is cleared BEFORE the run, not after: a killed jest never reaches its own
     * teardown, and Stryker kills instances as a matter of course, so the next start has to.
     */
    return rm(TEST_TMP_BASE, { recursive: true, force: true }).then(
        () =>
            new Promise<StrykerOutcome>((resolve) => {
                console.log(
                    `[mutation]${label ? ` ${label}` : ''} concurrency=${concurrency} ` +
                        `heap=${heapMb ? `${heapMb} MB` : 'node default (~4.2 GB, NOT scaled to RAM)'} ` +
                        `scratch=${TEST_TMP_BASE}`
                );

                const startedAt = Date.now();
                let oomRestarts = 0;
                let abortedForOom = false;

                // Streams Stryker's output through, in `REPO_ROOT`, with the capped-heap `childEnvironment`.
                // `--concurrency` is added only when the caller passed none.
                const stryker = spawn(
                    'npx',
                    [
                        'stryker',
                        'run',
                        ...(passedConcurrency ? [] : ['--concurrency', String(concurrency)]),
                        ...args
                    ],
                    {
                        cwd: REPO_ROOT,
                        env: childEnvironment,
                        /**
                         * `pipe` on stdout so the OOM line can be counted; every chunk is forwarded
                         * unchanged, so the progress bar and the report still reach the terminal.
                         */
                        stdio: ['inherit', 'pipe', 'inherit']
                    }
                );

                stryker.stdout.on('data', (chunk: Buffer) => {
                    process.stdout.write(chunk);
                    if (abortedForOom) return;

                    oomRestarts += chunk.toString().split('ran out of memory').length - 1;
                    if (oomRestarts < OOM_LIMIT || Date.now() - startedAt > OOM_WINDOW_MS) return;

                    abortedForOom = true;
                    console.error(
                        `\n[mutation] STOPPING: ${oomRestarts} worker restarts in the first ` +
                            `${Math.round((Date.now() - startedAt) / 60_000)} minutes.\n\n` +
                            `  This is the OOM/strand loop, not a slow run. Every restart discards that\n` +
                            `  worker's in-progress mutants, so the run cannot converge — the remaining-time\n` +
                            `  estimate will climb rather than fall if it is left alone.\n\n` +
                            `  What to read: docs/build/mutation-testing.md, "When a run never finishes".\n` +
                            `  What to try first: STRYKER_WORKER_HEAP_MB in .env — Node's default heap is a\n` +
                            `  flat ~4.2 GB regardless of how much RAM this machine has.\n`
                    );
                    stryker.kill('SIGTERM');
                });

                stryker.on('exit', (code) =>
                    resolve({ code: abortedForOom ? 1 : (code ?? 1), abortedForOom })
                );
            })
    );
};
