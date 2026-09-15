/**
 * @module
 * How hard the test runners may push THIS machine — the one place that decides it.
 *
 * Every sizing decision here was previously computed from `os.totalmem()` and a core count, in two
 * copies (`jest.config.js` and `scripts/mutation/run-tests.ts`). Total memory is the wrong input:
 * a 15 GB box with 6.6 GB actually free was sized for 15 GB, claimed eleven jest workers at ~905 MB
 * each, and the OOM killer arrived while every test still reported passing.
 *
 * Reads:  `MemAvailable`, then the caller's declared per-unit cost.
 * Owns:   worker counts, per-process heap caps, and shard counts.
 * Beaten: by an explicit environment variable, always — a number the operator sets is a fact about
 *         their machine that no heuristic here should second-guess.
 *
 * See: docs/tools/weak-machines.md
 */

import { readFileSync } from 'node:fs';
import os from 'node:os';

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

    // Checked rather than caught per-platform: a missing /proc is ordinary on macOS and Windows.
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
 * Sequential shards mean only one such process is live at a time, so it could in principle claim
 * the whole machine — and must not. `MAX_SHARD_PEAK_MB` is the ceiling, because a budget derived
 * from momentarily-free memory would size a single unbounded shard on an idle machine and hand back
 * exactly the run that fails.
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
 * Measured rather than chosen: `--shard=1/4 --runInBand` over the integration layer peaked at
 * 2407 MB RSS and passed, which is the largest shard this repo has evidence for. Sizing shards at
 * that peak keeps every machine on the configuration that has actually been observed green, and
 * keeps a big machine from quietly reverting to the one-process run that does not finish.
 */
export const MAX_SHARD_PEAK_MB = 2600;

/**
 * What one shard process is actually sized for: the budget, capped by what has been measured safe.
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
