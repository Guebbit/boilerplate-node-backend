/**
 * `scripts/mutation/ci/waves.ts` — the GitHub sweep's planner.
 *
 * The property everything rests on: no line of the scope is ever dropped. Every test here either
 * checks that coverage survives a step, or checks the one rule that decides what a failure becomes.
 */
import type {
    CiShard,
    ScopeFile,
    ShardOutcome,
    Unit
} from '../../../../../scripts/mutation/ci/waves';
import {
    MAX_ERROR_RETRIES,
    MAX_SHARDS_PER_WAVE,
    SHARD_LINES,
    SPLIT_FACTOR,
    firstWave,
    nextWave,
    outcomeOf,
    packUnits,
    spanOf,
    splitUnit,
    strykerArguments,
    unitsOf
} from '../../../../../scripts/mutation/ci/waves';

/** A scope file whose physical length is its non-blank count plus a fifth, like real source. */
const file = (name: string, lines: number): ScopeFile => ({
    file: name,
    lines,
    physicalLines: Math.round(lines * 1.2)
});

/** The lines a set of units covers, per file, as a sorted list — for "nothing was dropped". */
const coverage = (units: readonly Unit[]): Record<string, number[]> => {
    const lines: Record<string, Set<number>> = {};
    for (const unit of units) {
        const { from, to } = spanOf(unit);
        lines[unit.file] ??= new Set();
        for (let line = from; line <= to; line++) lines[unit.file].add(line);
    }
    return Object.fromEntries(
        Object.entries(lines).map(([name, set]) => [name, [...set].toSorted((a, b) => a - b)])
    );
};

/** Every line 1..n. */
const allLines = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

/** A plan's shards and backlog together. */
const everyShard = (plan: { shards: CiShard[]; backlog: CiShard[] }) => [
    ...plan.shards,
    ...plan.backlog
];

describe('unitsOf', () => {
    it('keeps a file that fits a shard whole', () => {
        expect(unitsOf(file('a.ts', SHARD_LINES))).toEqual([file('a.ts', SHARD_LINES)]);
    });

    it('slices a bigger file into contiguous slices covering every line exactly once', () => {
        const big = file('big.ts', SHARD_LINES * 3 + 1);
        const units = unitsOf(big);

        expect(units).toHaveLength(4);
        expect(coverage(units)['big.ts']).toEqual(allLines(big.physicalLines));
        expect(
            units.reduce((sum, unit) => sum + (spanOf(unit).to - spanOf(unit).from + 1), 0)
        ).toBe(big.physicalLines);
    });
});

describe('splitUnit', () => {
    it(`cuts a unit into ${SPLIT_FACTOR} slices over the same lines`, () => {
        const unit = unitsOf(file('big.ts', 1000))[1];
        const pieces = splitUnit(unit)!;

        expect(pieces).toHaveLength(SPLIT_FACTOR);
        expect(coverage(pieces)['big.ts']).toEqual(coverage([unit])['big.ts']);
    });

    it('refuses a unit too small to split', () => {
        expect(splitUnit({ ...file('tiny.ts', 10), slice: { from: 1, to: 10 } })).toBeUndefined();
    });
});

describe('packUnits', () => {
    it('puts a slice alone — its MUTATION_SLICE covers the whole run', () => {
        const slices = unitsOf(file('big.ts', 1000));
        const packed = packUnits([...slices, file('small.ts', 10)]);

        for (const shard of packed.filter((units) => units.some((unit) => unit.slice)))
            expect(shard).toHaveLength(1);
    });

    it('never fills a shard of whole files past the cap', () => {
        const files = Array.from({ length: 40 }, (_, index) =>
            file(`f${index}.ts`, 30 + index * 4)
        );
        const packed = packUnits(files);

        for (const shard of packed)
            expect(shard.reduce((sum, { lines }) => sum + lines, 0)).toBeLessThanOrEqual(
                SHARD_LINES
            );
        expect(packed.flat()).toHaveLength(files.length);
    });
});

describe('firstWave', () => {
    it('covers every line of the scope, with unique names', () => {
        const scope = [file('a.ts', 50), file('b.ts', 900), file('c.ts', 120)];
        const plan = firstWave(scope);
        const shards = everyShard(plan);

        expect(coverage(shards.flatMap(({ units }) => units))).toEqual(
            Object.fromEntries(
                scope.map(({ file: name, physicalLines }) => [name, allLines(physicalLines)])
            )
        );
        expect(new Set(shards.map(({ name }) => name)).size).toBe(shards.length);
        expect(shards[0].name).toBe('w1-000');
    });

    it(`caps a wave at ${MAX_SHARDS_PER_WAVE} shards and carries the rest`, () => {
        const scope = Array.from({ length: MAX_SHARDS_PER_WAVE + 10 }, (_, index) =>
            file(`f${index}.ts`, SHARD_LINES)
        );
        const plan = firstWave(scope);

        expect(plan.shards).toHaveLength(MAX_SHARDS_PER_WAVE);
        expect(plan.backlog).toHaveLength(10);
    });
});

/** Outcomes by shard name. */
const outcomes = (entries: Record<string, ShardOutcome>) => new Map(Object.entries(entries));

describe('nextWave', () => {
    /** A one-wave plan of the given shards, nothing in backlog. */
    const planOf = (shards: CiShard[]) => ({
        wave: 1,
        scope: [],
        shards,
        backlog: [],
        abandoned: []
    });

    const twoFiles: CiShard = {
        name: 'w1-000',
        units: [file('a.ts', 80), file('b.ts', 90)],
        errors: 0
    };
    const oneFile: CiShard = { name: 'w1-001', units: [file('c.ts', 150)], errors: 0 };

    it('drops a shard that reported', () => {
        expect(nextWave(planOf([oneFile]), outcomes({ 'w1-001': 'reported' })).shards).toEqual([]);
    });

    it('runs each file of a timed-out shard on its own', () => {
        const next = nextWave(planOf([twoFiles]), outcomes({ 'w1-000': 'timeout' }));

        expect(next.shards.map(({ units }) => units.map(({ file: name }) => name))).toEqual([
            ['a.ts'],
            ['b.ts']
        ]);
    });

    it('slices a timed-out single file over the same lines', () => {
        const next = nextWave(planOf([oneFile]), outcomes({ 'w1-001': 'timeout' }));

        expect(next.shards).toHaveLength(SPLIT_FACTOR);
        expect(coverage(next.shards.flatMap(({ units }) => units))).toEqual(
            coverage(oneFile.units)
        );
    });

    it(`retries a crashed shard as it was ${MAX_ERROR_RETRIES} time, then gives up on it`, () => {
        const second = nextWave(planOf([oneFile]), outcomes({ 'w1-001': 'error' }));
        expect(second.shards).toEqual([{ ...oneFile, name: 'w2-000', errors: 1 }]);

        const third = nextWave(second, outcomes({ 'w2-000': 'error' }));
        expect(third.shards).toEqual([]);
        expect(third.abandoned).toEqual([second.shards[0]]);
    });

    it('treats a shard that recorded no outcome at all as crashed', () => {
        expect(nextWave(planOf([oneFile]), outcomes({})).shards[0].errors).toBe(1);
    });

    it('retries a timed-out slice too small to split as a crash, not forever', () => {
        const tiny: CiShard = {
            name: 'w1-002',
            units: [{ ...file('t.ts', 10), slice: { from: 1, to: 10 } }],
            errors: 0
        };

        expect(nextWave(planOf([tiny]), outcomes({ 'w1-002': 'timeout' })).shards[0].errors).toBe(
            1
        );
    });

    it('runs retries before the backlog, renamed for the new wave', () => {
        const next = nextWave(
            { ...planOf([oneFile]), backlog: [{ ...twoFiles, name: 'w1-900' }] },
            outcomes({ 'w1-001': 'error' })
        );

        expect(next.shards.map(({ name, units }) => [name, units[0].file])).toEqual([
            ['w2-000', 'c.ts'],
            ['w2-001', 'a.ts']
        ]);
    });
});

describe('outcomeOf', () => {
    it('trusts a report on disk over the exit code', () => {
        expect(outcomeOf(1, true)).toBe('reported');
        expect(outcomeOf(124, true)).toBe('reported');
    });

    it("reads timeout's own exit codes as out of time", () => {
        expect(outcomeOf(124, false)).toBe('timeout');
        expect(outcomeOf(137, false)).toBe('timeout');
    });

    it('reads anything else without a report as a crash', () => {
        expect(outcomeOf(0, false)).toBe('error');
        expect(outcomeOf(1, false)).toBe('error');
    });
});

describe('strykerArguments', () => {
    it('lists whole files with no slice', () => {
        expect(
            strykerArguments({
                name: 'w1-000',
                units: [file('a.ts', 1), file('b.ts', 1)],
                errors: 0
            })
        ).toEqual({ mutate: 'a.ts,b.ts', slice: '' });
    });

    it('passes a slice as MUTATION_SLICE wants it', () => {
        expect(
            strykerArguments({
                name: 'w1-000',
                units: [{ ...file('a.ts', 1), slice: { from: 40, to: 90 } }],
                errors: 0
            })
        ).toEqual({ mutate: 'a.ts', slice: '40-90' });
    });
});
