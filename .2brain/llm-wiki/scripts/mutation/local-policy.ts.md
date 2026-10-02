---
source: scripts/mutation/local-policy.ts
sha256: c4e58185580c4c76c772334b8341514b380cb637900045ca8c183e47d805b41e
generated_at: 2026-10-01T12:33:12.207910+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/local-policy.ts

## Purpose

Pure decision logic that decides which mutation-testing shards a local evening should run, given which shards already have reports on disk. It is extracted from `run-shards.ts` so the resumability rule can be unit-tested in isolation from CLI wiring.

## Key elements

- **`ShardSelection`** (interface) — the return shape: `run` (shards to execute) and `done` (shards already reported, skipped this round).
- **`selectShards`** (function) — takes the full `Shard[]` plus options `{ completed, only?, limit?, force? }` and returns a `ShardSelection`.
  - `completed`: shard names that already have a report on disk.
  - `only`: explicit subset; empty/absent means "all outstanding."
  - `limit`: max shards to run this evening; `undefined` = no cap.
  - `force`: when `true`, ignores `completed` entirely (full re-measurement).

## Relationships

- **`scripts/mutation/sharding.ts`** — supplies the `Shard` type that both the input and the returned arrays are typed against.
- **`scripts/mutation/run-shards.ts`** — the CLI entry point that calls `selectShards` after reading prior reports from disk; this file holds no I/O or process management.
- **`tests/unit/scripts/mutation/local-policy.test.ts`** — exercises `selectShards` directly (resumability, `--only`, `--limit`, `force`) without launching the real runner.

## Notes

- The function is intentionally pure: no `fs`, no `process.argv`, no side effects. All policy is in the arguments.
- `force` does not change what is in `run` beyond removing the `done` filter; `only` and `limit` still apply. A stale report is honoured *indefinitely* until `force` is passed — there is no TTL or staleness heuristic here.
- The doc comment states the "refuse-everything" branch that existed in an earlier "run-all" mode has been removed; the full scope is always sharded (`npm run mutation:full`), so `selectShards` never needs to bail out.
