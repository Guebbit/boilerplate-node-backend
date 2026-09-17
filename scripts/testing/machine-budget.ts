/**
 * @module
 * How hard the test runners may push THIS machine — the one place that decides it.
 *
 * Reads:  `MemAvailable`, then the caller's declared per-unit cost — never `os.totalmem()`, which
 *         sizes for RAM this machine may not actually have free right now.
 * Owns:   worker counts, per-process heap caps, and shard counts.
 * Beaten: by an explicit environment variable, always — a number the operator sets is a fact about
 *         their machine that no heuristic here should second-guess.
 *
 * See: docs/tools/weak-machines.md
 */

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Memory a new workload can actually claim, in MB.
 *
 * `os.freemem()` maps to `MemFree` on Linux, which counts only untouched pages and so excludes the
 * reclaimable page cache — on a machine that has been up for a day it reads as a small fraction of
 * what a new process can really have. `MemAvailable` is the kernel's own estimate of exactly that,
 * so it is preferred and `os.freemem()` is the fallback for platforms without it.
 *
 * @returns available memory in MB, never above the machine's total
 */
export const availableMemoryMb = (): number => {
    const totalMb = Math.floor(os.totalmem() / 1024 / 1024);

    // Caught, not checked: /proc doesn't exist on macOS or Windows, and there is no cheaper way to
    // find that out than trying to read it.
    const fromProc = (): number | undefined => {
        try {
            const line = readFileSync('/proc/meminfo', 'utf8')
                .split('\n')
                .find((row) => row.startsWith('MemAvailable:'));
            const kb = Number(line?.replaceAll(/\D+/g, ''));
            return Number.isFinite(kb) && kb > 0 ? Math.floor(kb / 1024) : undefined;
        } catch {
            return undefined;
        }
    };

    const availableMb = fromProc() ?? Math.floor(os.freemem() / 1024 / 1024);
    return Math.max(1, Math.min(availableMb, totalMb));
};

/**
 * Reads `.env` WITHOUT merging it into the environment.
 *
 * `parseEnv` rather than `process.loadEnvFile()`, for the same reason `jest.config.js` gives: the
 * latter merges into `process.env`, and this script hands its environment to every jest it spawns.
 * The app's real rate limits would then land before `tests/support/setup.ts` can raise them, and
 * the concurrency suites would answer 429 to their own fixtures. Only the sizing knobs below are
 * ever taken out of the result.
 *
 * @returns the file's variables, or `{}` when there is no `.env` — the normal case in CI
 */
const readEnvironmentFile = (): NodeJS.Dict<string> => {
    const environmentFile = path.resolve(__dirname, '..', '..', '.env');
    // Checked rather than caught: a checkout without a `.env` is ordinary, not exceptional.
    return existsSync(environmentFile) ? parseEnv(readFileSync(environmentFile, 'utf8')) : {};
};

/** `.env`'s contents, read once — every knob below consults it, so re-reading per lookup would
 *  make this module's cost grow with the number of knobs rather than stay flat. */
const environmentFileValues = readEnvironmentFile();

/**
 * One sizing knob, from the real environment first and then `.env`.
 *
 * A variable exported for a single run beats the file, so a one-off can go lower without editing
 * anything: `JEST_WORKERS=1 npm run test:integration`.
 *
 * @param name the variable to read
 * @returns its positive-integer value, or undefined when unset, empty or nonsense
 */
export const environmentKnob = (name: string): number | undefined =>
    positiveInteger(process.env[name] ?? environmentFileValues[name]);

/** A positive integer from the environment, or undefined when unset, empty or nonsense. */
export const positiveInteger = (value: string | undefined): number | undefined => {
    const parsed = Number(value?.trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * Headroom left unclaimed for the OS, the container stack (Mongo/Redis/RabbitMQ) and an editor.
 * Subtracted before anything else is sized, so every number below is spending memory the rest of
 * the machine is not already using.
 */
export const OS_RESERVE_MB = 2048;

/**
 * What one jest process costs before it has run a single test file: the runner itself plus the
 * in-process `mongod` that `tests/support/global-setup.ts` starts for the run.
 *
 * Measured 2026-09-15 on the 19-file shard below — see {@link PER_FILE_RETENTION_MB}.
 */
export const PROCESS_BASELINE_MB = 1100;

/**
 * What each executed test FILE leaves behind in a jest process that does not recycle.
 *
 * Measured 2026-09-15: `--shard=1/4 --runInBand` over the integration layer ran 19 files and peaked
 * at 2407 MB RSS, so the 19 files added ~1.3 GB above {@link PROCESS_BASELINE_MB}. Jest gives every
 * file a fresh module registry but the process keeps what that registry allocated, which is why the
 * full 75-file run reaches Node's heap ceiling and dies.
 *
 * This is the constant that makes sharding necessary rather than decorative.
 */
export const PER_FILE_RETENTION_MB = 70;

/**
 * The spending limit for one jest process, in MB.
 *
 * Sequential shards mean only one such process is live at a time, so it may claim what the machine
 * has spare — bounded by {@link MAX_SHARD_PEAK_MB}, which says why.
 *
 * @param override an explicit cap in MB, which wins outright
 * @returns the per-process budget in MB
 */
export const processBudgetMb = (override?: number): number => {
    if (override) return override;
    return Math.max(MIN_PROCESS_BUDGET_MB, availableMemoryMb() - OS_RESERVE_MB);
};

/**
 * The floor for {@link processBudgetMb}. Below this a jest process cannot hold the runner plus one
 * test file, so a smaller number would not buy a passing run — it would buy a slower failing one.
 */
export const MIN_PROCESS_BUDGET_MB = PROCESS_BASELINE_MB + PER_FILE_RETENTION_MB;

/**
 * The most one shard process may be allowed to reach, in MB.
 *
 * This is a GUARD RAIL, not a target, and the distinction is the whole point of the number. A
 * budget derived from momentarily-free memory would size one enormous shard on an idle machine and
 * hand back exactly the unbounded run that does not finish — so something has to cap it.
 *
 * It is set high enough that a machine with real headroom runs a layer in ONE shard and pays no
 * sharding overhead at all: at 8 GB a shard may hold ~101 files, more than any layer here has, so
 * `--shard` is not passed and the run is what it always was. Sharding only begins where the
 * machine cannot hold the layer, which is the only place it earns its wall-clock cost.
 *
 * A memory-constrained machine does NOT rely on this ceiling — it sets `JEST_PROCESS_BUDGET_MB`
 * below it explicitly. See docs/tools/weak-machines.md for measured figures.
 */
export const MAX_SHARD_PEAK_MB = 8192;

/**
 * What one shard process is actually sized for: the budget, capped by the guard rail.
 *
 * @param budgetMb the result of {@link processBudgetMb}
 * @returns the per-shard target in MB
 */
export const shardTargetMb = (budgetMb: number): number =>
    Math.max(MIN_PROCESS_BUDGET_MB, Math.min(budgetMb, MAX_SHARD_PEAK_MB));

/**
 * How many test files one jest process may execute before it must exit and hand over to the next
 * shard.
 *
 * @param targetMb the per-shard target from {@link shardTargetMb}
 * @returns a file count of at least one
 */
export const filesPerShard = (targetMb: number): number =>
    Math.max(1, Math.floor((targetMb - PROCESS_BASELINE_MB) / PER_FILE_RETENTION_MB));

/**
 * How many sequential jest processes a layer needs.
 *
 * @param fileCount how many test files the layer matches
 * @param perShard the result of {@link filesPerShard}
 * @returns a shard count of at least one, never more than the file count
 */
export const shardCount = (fileCount: number, perShard: number): number => {
    if (fileCount <= 0) return 1;
    return Math.max(1, Math.min(fileCount, Math.ceil(fileCount / perShard)));
};

/**
 * How many parallel workers a pool may run, bounded by cores AND by memory.
 *
 * The memory half is what jest's own `logical CPUs - 1` default misses: this workload is bounded by
 * RAM, so on a many-core machine the core count alone authorises a pool the memory cannot feed.
 *
 * @param options.peakMb measured peak cost of ONE worker
 * @param options.cpuReserve cores left for everything that is not a worker
 * @param options.override an explicit count, which wins outright
 * @returns a worker count of at least one
 */
export const workerCount = ({
    peakMb,
    cpuReserve,
    override
}: {
    peakMb: number;
    cpuReserve: number;
    override?: number;
}): number => {
    if (override) return override;

    const cpuCap = os.cpus().length - cpuReserve;
    const ramCap = Math.floor((availableMemoryMb() - OS_RESERVE_MB) / peakMb);

    // At least one, or a single-core or low-memory container would compute zero and run nothing.
    return Math.max(1, Math.min(cpuCap, ramCap));
};

/**
 * V8's old-space cap for a spawned jest process, in MB.
 *
 * Pinned rather than left to Node, which derives its ceiling from TOTAL system RAM — so the same
 * suite gets a longer runway on a bigger machine, which is how a retention problem stays invisible
 * on the box most able to survive it. Set to the shard target, so the cap and the shard size are
 * two statements of the same budget rather than two numbers that can drift apart.
 *
 * @param targetMb the per-shard target from {@link shardTargetMb}
 * @returns the value for `--max-old-space-size`
 */
export const heapCapMb = (targetMb: number): number => targetMb;
