/**
 * @module
 * The sizing arithmetic behind `npm run test:*` — `scripts/testing/machine-budget.ts`.
 *
 * Every function here decides how much of the machine a suite may take, which makes a wrong answer
 * expensive in both directions: too high and the OOM killer takes a worker mid-file, too low and a
 * strong machine pays sharding overhead it does not need. Both directions are asserted.
 *
 * @see docs/build/weak-machines.md#start-here-—-the-two-mechanisms
 */

import os from 'node:os';
import {
    MAX_SHARD_PEAK_MB,
    MIN_PROCESS_BUDGET_MB,
    PER_FILE_RETENTION_MB,
    PROCESS_BASELINE_MB,
    availableMemoryMb,
    clampShards,
    environmentKnob,
    filesPerShard,
    heapCapMb,
    parseShardSelector,
    positiveInteger,
    processBudgetMb,
    shardCount,
    shardTargetMb,
    sliceShards,
    workerCount
} from '../../../../scripts/testing/machine-budget';
import { setProcessEnvironment } from '@tests/environment';

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

    it('reads a positive integer out of the real environment', () => {
        setProcessEnvironment({ [NAME]: '3' });

        expect(environmentKnob(NAME)).toBe(3);
    });

    it.each(['0', '-1', 'plenty', ''])('treats %p as unset rather than as a value', (value) => {
        /**
         * Nonsense must not read as zero: a zero worker count or a zero-file shard is a run that
         * tests nothing and reports green.
         */
        setProcessEnvironment({ [NAME]: value });

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
        /**
         * The floor matters because a budget below it would compute zero files per shard, and a
         * shard that runs no files is a green run that tested nothing.
         */
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
        /**
         * 0 means `--listTests` answered nothing, which is a broken invocation rather than an empty
         * layer. One shard runs whatever is really there instead of dividing by zero.
         */
        expect(shardCount(0, 21)).toBe(1);
    });
});

describe('clampShards', () => {
    it('passes a sane override through untouched', () => {
        expect(clampShards(4, 75)).toBe(4);
    });

    it('caps an override above the file count, so no shard runs empty', () => {
        /**
         * The fuzz layer has 2 files: JEST_SHARDS=4 must not ask for a shard beyond file 2, which
         * would print "No tests found" and exit non-zero while every real test passes.
         */
        expect(clampShards(4, 2)).toBe(2);
        expect(clampShards(30, 26)).toBe(26);
    });

    it('floors at one shard', () => {
        expect(clampShards(0, 75)).toBe(1);
    });

    it('treats an unknown file count as one shard, like shardCount does', () => {
        expect(clampShards(4, 0)).toBe(1);
    });
});

describe('parseShardSelector', () => {
    it('reads i/n as a 1-based slice', () => {
        expect(parseShardSelector('2/4')).toEqual({ index: 2, count: 4 });
        expect(parseShardSelector(' 4/4 ')).toEqual({ index: 4, count: 4 });
    });

    it.each([undefined, '', '4', '0/4', '5/4', '1/0', '-1/4', '1.5/4', 'a/b', '1/4/2'])(
        'refuses %p, so a typo runs the whole layer rather than an invented slice',
        (value) => {
            expect(parseShardSelector(value)).toBeUndefined();
        }
    );
});

describe('sliceShards', () => {
    it('splits the memory-driven shards over the jobs, keeping each at the single-machine size', () => {
        // 5 shards on one machine, 4 jobs: 2 per job, 8 jest shards in all.
        expect(sliceShards({ index: 1, count: 4 }, 5, 406)).toEqual({ total: 8, mine: [1, 5] });
        expect(sliceShards({ index: 4, count: 4 }, 5, 406)).toEqual({ total: 8, mine: [4, 8] });
    });

    it('runs every shard exactly once across the jobs', () => {
        const all = [1, 2, 3, 4].flatMap((index) => sliceShards({ index, count: 4 }, 5, 406).mine);

        expect(all.toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('gives each job one shard when the layer already fits in as many as there are jobs', () => {
        expect(sliceShards({ index: 2, count: 4 }, 1, 406)).toEqual({ total: 4, mine: [2] });
        expect(sliceShards({ index: 3, count: 3 }, 3, 540)).toEqual({ total: 3, mine: [3] });
    });

    it('caps the total at the file count, so a job past it runs nothing instead of an empty shard', () => {
        expect(sliceShards({ index: 1, count: 4 }, 1, 2)).toEqual({ total: 2, mine: [1] });
        expect(sliceShards({ index: 4, count: 4 }, 1, 2)).toEqual({ total: 2, mine: [] });
    });
});

describe('heapCapMb', () => {
    it('hands a lone process the whole budget by default', () => {
        // One number, stated twice, cannot drift: the cap and the budget are the same figure.
        expect(heapCapMb(2600)).toBe(2600);
    });

    it('divides the budget across the processes spending it at once', () => {
        // Four workers sharing one budget must not each claim the full amount.
        expect(heapCapMb(2600, 4)).toBe(650);
    });

    it('floors rather than rounds, so workers never jointly exceed the budget', () => {
        expect(heapCapMb(2601, 4)).toBe(650);
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
        /**
         * A roomy machine must run the integration layer in ONE shard: a flat per-shard ceiling
         * would force sharding's wall-clock cost onto a machine that has no need of it.
         */
        const perShard = filesPerShard(shardTargetMb(processBudgetMb(30_000)));

        expect(perShard).toBeGreaterThan(INTEGRATION_FILES);
        expect(shardCount(INTEGRATION_FILES, perShard)).toBe(1);
    });

    it('shards a memory-constrained machine instead of letting it OOM', () => {
        /**
         * 2600 MB is the figure measured green here: 19 files peaked at 2407 MB RSS and passed,
         * where all 75 in one process reached Node's heap ceiling and died.
         */
        const perShard = filesPerShard(shardTargetMb(processBudgetMb(2600)));

        expect(perShard).toBeLessThan(INTEGRATION_FILES);
        expect(shardCount(INTEGRATION_FILES, perShard)).toBeGreaterThan(1);
    });
});
