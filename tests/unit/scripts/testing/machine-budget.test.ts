/**
 * @module
 * The sizing arithmetic behind `npm run test:*` — `scripts/testing/machine-budget.ts`.
 *
 * Every function here decides how much of the machine a suite may take, which makes a wrong answer
 * expensive in both directions: too high and the OOM killer takes a worker mid-file, too low and a
 * strong machine pays sharding overhead it does not need. Both directions are asserted.
 *
 * See: docs/tools/weak-machines.md
 */

import os from 'node:os';
import {
    MAX_SHARD_PEAK_MB,
    MIN_PROCESS_BUDGET_MB,
    PER_FILE_RETENTION_MB,
    PROCESS_BASELINE_MB,
    availableMemoryMb,
    environmentKnob,
    filesPerShard,
    heapCapMb,
    positiveInteger,
    processBudgetMb,
    shardCount,
    shardTargetMb,
    workerCount
} from '../../../../scripts/testing/machine-budget';

/** How many files the integration layer holds today — the layer that forced sharding to exist. */
const INTEGRATION_FILES = 75;

describe('positiveInteger', () => {
    it.each([
        ['4', 4],
        [' 4 ', 4],
        ['0', undefined],
        ['-2', undefined],
        ['2.5', undefined],
        ['', undefined],
        ['   ', undefined],
        ['many', undefined],
        [undefined, undefined]
    ])('reads %p as %p', (input, expected) => {
        expect(positiveInteger(input)).toBe(expected);
    });
});

describe('environmentKnob', () => {
    const NAME = 'JEST_WORKERS_TEST_ONLY';

    afterEach(() => {
        delete process.env[NAME];
    });

    it('reads a positive integer out of the real environment', () => {
        process.env[NAME] = '3';

        expect(environmentKnob(NAME)).toBe(3);
    });

    it.each(['0', '-1', 'plenty', ''])('treats %p as unset rather than as a value', (value) => {
        // Nonsense must not read as zero: a zero worker count or a zero-file shard is a run that
        // tests nothing and reports green.
        process.env[NAME] = value;

        expect(environmentKnob(NAME)).toBeUndefined();
    });

    it('is undefined for a name nothing sets', () => {
        expect(environmentKnob('NOTHING_SETS_THIS_AT_ALL')).toBeUndefined();
    });
});

describe('availableMemoryMb', () => {
    it('reports a positive figure that never exceeds the machine total', () => {
        const totalMb = Math.floor(os.totalmem() / 1024 / 1024);

        expect(availableMemoryMb()).toBeGreaterThan(0);
        expect(availableMemoryMb()).toBeLessThanOrEqual(totalMb);
    });
});

describe('processBudgetMb', () => {
    it('lets an explicit override win outright, so a pinned .env beats the computation', () => {
        expect(processBudgetMb(2600)).toBe(2600);
    });

    it('never returns less than one baseline plus one file', () => {
        // The floor matters because a budget below it would compute zero files per shard, and a
        // shard that runs no files is a green run that tested nothing.
        expect(processBudgetMb()).toBeGreaterThanOrEqual(MIN_PROCESS_BUDGET_MB);
    });
});

describe('shardTargetMb', () => {
    it('caps a momentarily-idle huge machine at the guard rail', () => {
        expect(shardTargetMb(64_000)).toBe(MAX_SHARD_PEAK_MB);
    });

    it('passes a modest budget through untouched', () => {
        expect(shardTargetMb(2600)).toBe(2600);
    });

    it('raises a budget below the floor rather than honouring it', () => {
        expect(shardTargetMb(10)).toBe(MIN_PROCESS_BUDGET_MB);
    });
});

describe('filesPerShard', () => {
    it('spends only what is left after the runner and its mongod', () => {
        const target = PROCESS_BASELINE_MB + PER_FILE_RETENTION_MB * 10;

        expect(filesPerShard(target)).toBe(10);
    });

    it('never returns zero, however small the target', () => {
        expect(filesPerShard(0)).toBe(1);
        expect(filesPerShard(PROCESS_BASELINE_MB)).toBe(1);
    });
});

describe('shardCount', () => {
    it.each([
        [75, 21, 4],
        [75, 101, 1],
        [75, 75, 1],
        [2, 21, 1]
    ])('splits %i files at %i per shard into %i shard(s)', (files, perShard, expected) => {
        expect(shardCount(files, perShard)).toBe(expected);
    });

    it('never asks for more shards than there are files to fill them', () => {
        expect(shardCount(3, 1)).toBe(3);
    });

    it('treats a layer jest could not count as one shard', () => {
        // 0 means `--listTests` answered nothing, which is a broken invocation rather than an empty
        // layer. One shard runs whatever is really there instead of dividing by zero.
        expect(shardCount(0, 21)).toBe(1);
    });
});

describe('heapCapMb', () => {
    it('pins the old space to the same figure the shard is sized for', () => {
        // One number, stated twice, cannot drift: the cap and the shard size are the same budget.
        expect(heapCapMb(2600)).toBe(2600);
    });
});

describe('workerCount', () => {
    it('lets an explicit override win outright', () => {
        expect(workerCount({ peakMb: 905, cpuReserve: 2, override: 2 })).toBe(2);
    });

    it('never returns zero, so a single-core low-memory container still runs something', () => {
        expect(workerCount({ peakMb: 1_000_000, cpuReserve: os.cpus().length })).toBe(1);
    });

    it('is bounded by cores as well as by memory', () => {
        expect(workerCount({ peakMb: 1, cpuReserve: 2 })).toBeLessThanOrEqual(
            Math.max(1, os.cpus().length - 2)
        );
    });
});

describe('the two machines this all exists for', () => {
    it('runs a roomy machine in ONE shard, so sharding costs it nothing', () => {
        // A roomy machine must run the integration layer in ONE shard: a flat per-shard ceiling
        // would force sharding's wall-clock cost onto a machine that has no need of it.
        const perShard = filesPerShard(shardTargetMb(processBudgetMb(30_000)));

        expect(perShard).toBeGreaterThan(INTEGRATION_FILES);
        expect(shardCount(INTEGRATION_FILES, perShard)).toBe(1);
    });

    it('shards a memory-constrained machine instead of letting it OOM', () => {
        // 2600 MB is the figure measured green here: 19 files peaked at 2407 MB RSS and passed,
        // where all 75 in one process reached Node's heap ceiling and died.
        const perShard = filesPerShard(shardTargetMb(processBudgetMb(2600)));

        expect(perShard).toBeLessThan(INTEGRATION_FILES);
        expect(shardCount(INTEGRATION_FILES, perShard)).toBeGreaterThan(1);
    });
});
