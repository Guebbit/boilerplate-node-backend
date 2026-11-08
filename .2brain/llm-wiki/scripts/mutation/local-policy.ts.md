---
source: scripts/mutation/local-policy.ts
sha256: c4e58185580c4c76c772334b8341514b380cb637900045ca8c183e47d805b41e
generated_at: 2026-11-08T02:53:38.569789+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/local-policy.ts

## Purpose

Pure selection logic that decides which mutation-testing shards a local evening sweep will actually run. Extracted from `run-shards.ts` so the resumability rule (skip already-reported shards, narrow by `--only`, cap by `--limit`) is unit-testable without invoking a CLI.

## Key elements

- **`ShardSelection`** (interface) — the result shape: `run` (shards to execute this evening) and `done` (shards skipped because a report already exists).
- **`selectShards`** (exported const) — takes the full shard list plus `{ completed, only?, limit?, force? }` and returns a `ShardSelection`. Filters by explicit names, excludes already-completed shards (unless `force`), then slices to `limit`.

## Relationships

- **`scripts/mutation/sharding.ts`** — supplies the `Shard` type that `selectShards` operates on; this file is the consumer of that type.
- **`scripts/mutation/run-shards.ts`** — the CLI entry point that calls `selectShards` to decide what to execute; this file is its extracted "pure half."
- **`tests/unit/scripts/mutation/local-policy.test.ts`** — unit-tests `selectShards` directly, exercising the resumability, `--only`, `--limit`, and `force` paths.

## Notes

- There is intentionally no "run everything in one shot" path: the full scope is always sharded (`npm run mutation:full`), so `selectShards` never needs a refusal branch.
- `force: true` empties the `done` list entirely, treating all shards as outstanding regardless of existing reports.
- `only` is a whitelist filter applied *before* the completed check, so a shard named in `--only` but already reported will land in `done`, not `run`.
