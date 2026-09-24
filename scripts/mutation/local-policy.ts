/**
 * @module
 * Which shards a local sweep actually runs, given what previous evenings recorded — the pure half
 * of `run-shards.ts`, so the resumability rule is tested rather than buried in a CLI.
 *
 * There is no "everything in one go" command any more: the full scope is always sharded
 * (`npm run mutation:full`), so there is nothing left here to refuse.
 *
 * See: docs/tools/mutation-testing.md#running-it-locally
 */
import type { Shard } from './sharding';

/** What one evening runs: the outstanding shards, narrowed by `--only` and capped by `--limit`. */
export interface ShardSelection {
    /** Shards with no report yet, after `--only` and `--limit`. */
    run: Shard[];
    /** Shards skipped because a previous evening already recorded them. */
    done: Shard[];
}

/**
 * Which shards to run now.
 *
 * Resumability is the whole point of sharding locally: an evening that covers three shards leaves
 * three reports behind, and the next evening starts at the fourth rather than at the beginning.
 * `force` is how a full re-measurement is asked for, since a stale report is otherwise indefinitely
 * honoured.
 *
 * @param completed shard names that already have a report on disk
 * @param only shard names the caller asked for explicitly, empty for "whatever is outstanding"
 * @param limit how many shards this evening may run, or `undefined` for all of them
 */
export const selectShards = (
    shards: readonly Shard[],
    {
        completed,
        only = [],
        limit,
        force = false
    }: {
        completed: readonly string[];
        only?: readonly string[];
        limit?: number;
        force?: boolean;
    }
): ShardSelection => {
    const asked = only.length > 0 ? shards.filter(({ name }) => only.includes(name)) : [...shards];
    const done = force ? [] : asked.filter(({ name }) => completed.includes(name));
    const outstanding = asked.filter(({ name }) => !done.some((shard) => shard.name === name));

    return { run: limit === undefined ? outstanding : outstanding.slice(0, limit), done };
};
