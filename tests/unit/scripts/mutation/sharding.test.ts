/**
 * `scripts/mutation/sharding.ts` — the nightly `mutation-deep` matrix, built by line count.
 *
 * Driven against synthetic file lists, never a real directory walk: that half
 * (`scripts/mutation/shard-plan.ts`) is a thin, untested CLI wrapper, same split as
 * `check-baseline.ts` over `baseline.ts` in this same directory.
 */
import {
    TARGET_LINES_PER_SHARD,
    packIntoShards,
    rotationPlan,
    type Shard
} from '../../../../scripts/mutation/sharding';

/** A `{file, lines}` list from `[name, lines]` pairs, named so the fixtures stay readable. */
const files = (...entries: [string, number][]) => entries.map(([file, lines]) => ({ file, lines }));

describe('packIntoShards', () => {
    it('puts every file into exactly one shard', () => {
        const input = files(['a.ts', 400], ['b.ts', 900], ['c.ts', 1500], ['d.ts', 200]);

        const shards = packIntoShards(input);

        expect(shards.flatMap((shard) => shard.mutate.split(','))).toEqual(
            expect.arrayContaining(['a.ts', 'b.ts', 'c.ts', 'd.ts'])
        );
        expect(shards.reduce((sum, shard) => sum + shard.lines, 0)).toBe(
            input.reduce((sum, { lines }) => sum + lines, 0)
        );
    });

    it('sizes the shard count from the target, not from the file count', () => {
        // 10 files at 500 lines each is 5000 lines — just over 3 shards' worth at the target.
        const input = Array.from({ length: 10 }, (_, index): [string, number] => [
            `file-${index}.ts`,
            500
        ]);

        const shards = packIntoShards(files(...input));

        expect(shards).toHaveLength(Math.ceil(5000 / TARGET_LINES_PER_SHARD));
    });

    it('balances a lopsided input rather than leaving one shard 30x another', () => {
        // One huge file plus a pile of tiny ones — the failure this whole design exists to avoid
        // was one module (`account`) alone setting the wall clock for the entire matrix.
        const input = files(
            ['huge.ts', 6000],
            ...Array.from({ length: 20 }, (_, index): [string, number] => [`tiny-${index}.ts`, 50])
        );

        const shards = packIntoShards(input);
        const lines = shards.map((shard) => shard.lines);

        expect(Math.max(...lines) / Math.min(...lines)).toBeLessThanOrEqual(30);
    });

    it('never produces an empty shard', () => {
        const shards = packIntoShards(files(['only.ts', 10]));

        expect(shards.every((shard) => shard.mutate.length > 0)).toBe(true);
    });

    it('names shards deterministically so the same input always plans the same matrix', () => {
        const input = files(['a.ts', 300], ['b.ts', 700]);

        expect(packIntoShards(input)).toEqual(packIntoShards(input));
    });
});

describe('rotationPlan', () => {
    const threeShards: Shard[] = [
        { name: 'shard-00', mutate: 'a.ts', lines: 100 },
        { name: 'shard-01', mutate: 'b.ts', lines: 100 },
        { name: 'shard-02', mutate: 'c.ts', lines: 100 }
    ];

    it('runs every shard on the full pass', () => {
        expect(rotationPlan(threeShards, { full: true, epochDay: 0 }).shards).toEqual(threeShards);
    });

    it('flags the full pass in its result', () => {
        expect(rotationPlan(threeShards, { full: true, epochDay: 0 }).full).toBe(true);
    });

    it('runs a different subset on consecutive days', () => {
        const day0 = rotationPlan(threeShards, { full: false, epochDay: 0 }).shards;
        const day1 = rotationPlan(threeShards, { full: false, epochDay: 1 }).shards;

        expect(day0).not.toEqual(day1);
    });

    it('covers every shard exactly once across one full rotation', () => {
        const seen = new Set<string>();
        for (let day = 0; day < 3; day++)
            for (const shard of rotationPlan(threeShards, { full: false, epochDay: day }).shards)
                seen.add(shard.name);

        expect(seen).toEqual(new Set(threeShards.map((shard) => shard.name)));
    });

    it('is stable for the same epoch day', () => {
        const first = rotationPlan(threeShards, { full: false, epochDay: 5 });
        const second = rotationPlan(threeShards, { full: false, epochDay: 5 });

        expect(first).toEqual(second);
    });
});
