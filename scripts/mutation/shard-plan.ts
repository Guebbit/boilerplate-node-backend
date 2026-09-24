#!/usr/bin/env tsx
/**
 * Prints the weekly full-sweep matrix as a GitHub Actions job output.
 *
 *   npx tsx scripts/mutation/shard-plan.ts >> "$GITHUB_OUTPUT"
 *
 * Emits one line, `shards=<json>` — an array of `{name, mutate}`, consumed as
 * `strategy.matrix.include`. The full scope is always sharded (there is no rotation any more: one
 * weekly pass covers every shard), so this is just the plan paired with a real directory walk.
 *
 * Pure planning logic lives in `scripts/mutation/sharding.ts`, tested directly against synthetic
 * file lists, and the tree walk in `scripts/mutation/mutate-scope.ts`; this file's only job is
 * pairing the two.
 */
import { scopeWithLines } from './mutate-scope';
import { packIntoShards } from './sharding';

/** This week's shards — the whole mutate scope, bin-packed by line count. */
const shards = packIntoShards(scopeWithLines());

console.log(`shards=${JSON.stringify(shards.map(({ name, mutate }) => ({ name, mutate })))}`);
