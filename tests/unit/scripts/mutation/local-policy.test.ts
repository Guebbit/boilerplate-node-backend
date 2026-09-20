/**
 * `scripts/mutation/local-policy.ts` — how a sharded sweep resumes where the last evening stopped.
 *
 * Pure input/output, like `sharding.test.ts` next door: the CLI that calls this
 * (`run-shards.ts`) stays a thin, untested wrapper.
 */
import { selectShards } from '../../../../scripts/mutation/local-policy';
import type { Shard } from '../../../../scripts/mutation/sharding';

/** Shards from names alone — nothing here reads `mutate` or `lines`. */
const shards = (...names: string[]): Shard[] =>
    names.map((name) => ({ name, mutate: `${name}.ts`, lines: 100 }));

describe('selectShards', () => {
    it('runs only what no previous evening recorded', () => {
        const selection = selectShards(shards('a', 'b', 'c'), { completed: ['a'] });

        expect(selection.run.map(({ name }) => name)).toEqual(['b', 'c']);
        expect(selection.done.map(({ name }) => name)).toEqual(['a']);
    });

    it('caps an evening at --limit, leaving the rest outstanding', () => {
        const selection = selectShards(shards('a', 'b', 'c', 'd'), { completed: [], limit: 2 });

        expect(selection.run.map(({ name }) => name)).toEqual(['a', 'b']);
    });

    it('narrows to the shards named by --only', () => {
        const selection = selectShards(shards('a', 'b', 'c'), { completed: [], only: ['c'] });

        expect(selection.run.map(({ name }) => name)).toEqual(['c']);
    });

    it('re-runs a recorded shard under --force, and reports nothing as done', () => {
        const selection = selectShards(shards('a', 'b'), { completed: ['a', 'b'], force: true });

        expect(selection.run.map(({ name }) => name)).toEqual(['a', 'b']);
        expect(selection.done).toEqual([]);
    });

    it('treats --only against an already recorded shard as nothing to do', () => {
        const selection = selectShards(shards('a', 'b'), { completed: ['a'], only: ['a'] });

        expect(selection.run).toEqual([]);
        expect(selection.done.map(({ name }) => name)).toEqual(['a']);
    });
});
