---
source: scripts/mutation/shard-plan.ts
sha256: c96ca60f38370a40b2665a96217cd81d1b68c837f487837c53fe09c541b359bb
generated_at: 2026-09-23T17:29:00.062843+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/shard-plan.ts

## Purpose

A thin CLI entry point that pairs the project's mutation-scope tree walk with the bin-packing sharder and prints the resulting shard matrix to stdout for consumption as a GitHub Actions job output. It exists solely to wire together `mutate-scope.ts` and `sharding.ts` so the weekly full-sweep workflow can enumerate its parallel shards.

## Key elements

- **`shards`** (const) — calls `packIntoShards(scopeWithLines())`; the result is an array of `{ name, mutate }` objects covering the entire mutation scope.
- **`console.log(...)`** — prints a single line `shards=<json>` to stdout. The workflow appends this to `$GITHUB_OUTPUT` and references it as `strategy.matrix.include`.

No exported functions, classes, or additional constants.

## Relationships

- **`scripts/mutation/mutate-scope.ts`** — provides `scopeWithLines()`, the directory walk that produces the list of mutable files with their line counts. This script is its only consumer.
- **`scripts/mutation/sharding.ts`** — provides `packIntoShards()`, the pure bin-packing algorithm that groups files into named shards by total line count. Unit-tested in isolation against synthetic file lists; this script simply calls it.
- **`github/workflows/mutation.yml`** — invokes this script (`npx tsx scripts/mutation/shard-plan.ts >> "$GITHUB_OUTPUT"`) and reads the `shards` output as the matrix for parallel mutation jobs.

## Notes

- The doc comment explicitly states there is **no rotation** any more: one weekly pass covers every shard, so the "plan" is always the full scope.
- The script intentionally contains **no logic of its own** — all planning and tree-walking live in the two imported modules. If you need to change sharding behavior, edit `sharding.ts`; if you need to change which files are in scope, edit `mutate-scope.ts`.
- Output format is a single `shards=` line; breaking this contract (e.g. adding extra log lines to stdout) will corrupt the GHA output parsing.
