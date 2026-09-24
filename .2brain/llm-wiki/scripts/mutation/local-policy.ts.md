---
source: scripts/mutation/local-policy.ts
sha256: 094f3ac40341a77c012061c8675316edce48071d476025fd8ed2309c91cb192e
generated_at: 2026-09-23T17:28:15.079524+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/local-policy.ts

## Purpose

Pure selection logic for a local mutation-testing sweep: given the full shard list and what previous evenings already reported, it decides which shards to run now. It exists as a separate module from `run-shards.ts` so the resumability rule is unit-testable without invoking a CLI.

## Key elements

- **`ShardSelection` (interface)** — the return shape: `run` (shards to execute this evening) and `done` (shards already covered by a prior report).
- **`selectShards` (function)** — the sole logic export. Accepts the full `Shard[]` plus an options bag:
    - `completed` – shard names that already have a report on disk.
    - `only` – optional explicit whitelist of shard names (empty = all outstanding).
    - `limit` – optional cap on how many shards to run; `undefined` means no cap.
    - `force` – when `true`, ignores `completed` entirely (full re-measurement).
      Returns a `ShardSelection` with `run` and `done` partitioned by those rules.

## Relationships

- **`scripts/mutation/sharding.ts`** — provides the `Shard` type consumed here.
- **`scripts/mutation/run-shards.ts`** — the CLI caller; delegates its selection decision to `selectShards` so the command-line layer stays thin.
- **`tests/unit/scripts/mutation/local-policy.test.ts`** — unit-tests the `selectShards` logic in isolation (the reason this file is split out of the CLI).

## Notes

- There is intentionally no "run everything in one go" path; the full scope is always sharded (`npm run mutation:full`), so `selectShards` has no branch to refuse an oversized request.
- A shard's report is honoured indefinitely unless `force` is set — there is no TTL or staleness check in this module.
- `limit` uses `undefined` (not `null` or `0`) to signal "no cap"; passing `0` would slice to an empty array.
