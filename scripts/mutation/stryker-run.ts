/**
 * @module
 * One Stryker invocation, sized for THIS machine — the half every mutation entry point shares.
 *
 * Owns:   concurrency, the per-worker heap cap, the scratch sweep, and the OOM-loop abort.
 * Why:    both entry points (`run-diff`, `run-shards`) need all four, and one that used to call
 *         `npx stryker` directly silently ran without the heap cap — which is the one setting a
 *         run on a 30 GB machine cannot do without.
 *
 * See: docs/tools/mutation-testing.md#worker-heap-cap
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { availableMemoryMb, environmentKnob } from '../testing/machine-budget';

/** The repo root — the working directory every spawned jest inherits. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Measured peak RSS of one Stryker/jest worker during a mutation run, rounded up —
 * docs/tools/mutation-testing.md#the-worker-pool-multiplication. The ceiling for this run is RAM,
 * not cores, which is why the default below is computed from it instead of copying `jest`'s
 * CPU-only heuristic.
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

/** Where jest's in-memory Mongo data directories live. Outside the sandbox, deliberately. */
const TEST_TMP_BASE = path.join(REPO_ROOT, '.tmp');

/**
 * How many restarts, inside how long, count as the loop rather than bad luck.
 *
 * A single restart is survivable — a genuinely heavy suite can trip the ceiling once. Six inside
 * ten minutes is not a heavy suite, it is a run that will not converge.
 */
const OOM_LIMIT = 6;
const OOM_WINDOW_MS = 10 * 60 * 1000;

/**
 * How many Stryker workers to run.
 *
 * `STRYKER_CONCURRENCY` always wins. Unset, the safe number is computed from this machine rather
 * than left to `stryker.json`'s committed `concurrency: 4` — a number sized for a
 * contributor's laptop, not necessarily this one.
 * See docs/tools/mutation-testing.md#the-worker-pool-multiplication.
 *
 * @returns `STRYKER_CONCURRENCY` when set, otherwise the lower of `logical CPUs - 1` and free
 *   memory (`MemAvailable`, not total) divided by one worker's peak RSS
 */
export const resolveConcurrency = (): number => {
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
    code: number;
    abortedForOom: boolean;
}

/**
 * Runs Stryker once, with this machine's settings applied and the OOM loop watched for.
 *
 * @param args CLI arguments appended verbatim after `run` — a config path, `--mutate`, `--force`
 * @param label printed alongside the settings, so one line of a long log says which piece this is
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

    /*
     * `--max-old-space-size` raises V8's default, a flat ~4.2 GB here rather than a share of the
     * machine — a worker wanting more dies in the first minute. It cannot bound memory held outside
     * the heap, such as `bson`'s buffers. See docs/tools/mutation-testing.md#worker-heap-cap.
     *
     * `...process.env`, never `.env` merged in first: `.env`'s real `NODE_RATE_LIMIT_REDIS_ENABLED`/
     * `NODE_REDIS_URL` would otherwise reach every spawned jest before `tests/support/setup.ts` can
     * override them, and every rate-limit suite fails open against a Redis that is not reachable
     * from here — see `environmentKnob`'s own reasoning in `machine-budget.ts`.
     */
    const childEnvironment = {
        ...process.env,
        NODE_TEST_TMP_BASE: TEST_TMP_BASE,
        ...(heapMb
            ? {
                  NODE_OPTIONS:
                      `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=${heapMb}`.trim()
              }
            : {})
    };

    /*
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
                        // `pipe` on stdout so the OOM line can be counted; every chunk is forwarded
                        // unchanged, so the progress bar and the report still reach the terminal.
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
                            `  What to read: docs/tools/mutation-testing.md, "When a run never finishes".\n` +
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
