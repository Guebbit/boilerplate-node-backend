---
source: tests/cluster/rate-limit.test.ts
sha256: 42dbdf7a2ce0767b326d17e5d971faba0d281cedb3c4502dbd0da597b1de10e8
generated_at: 2026-11-14T22:56:45.282881+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/rate-limit.test.ts

## Purpose

Verifies that `express-rate-limit` enforces a single shared budget across all forked workers when counters are stored in Redis, and demonstrates (as a deliberate control) that per-process in-memory counters grant `LIMIT × workers` instead. The suite exists because no single-process test can observe the bug this file guards against: a regression to the in-memory store would pass every other test in the repository.

## Key elements

- **`LIMIT`, `WORKERS`, `BURST`** — constants: 5, 2, 30. Chosen so the burst exceeds the budget but the margin isn't an off-by-one.
- **`keyPrefix()`** — generates a unique Redis key prefix per run (`cluster-test-<pid>-<timestamp>`) to avoid cross-run contamination within the 60-second rate-limit window.
- **`burstAgainst(cluster)`** — fires `BURST` requests concurrently, each on a fresh connection (`getOnFreshConnection`), then tallies status codes via `tally`.
- **`'spends one budget across every worker'`** — the fix case. Spins up a 2-worker cluster with `NODE_RATE_LIMIT_REDIS_URL` set; asserts exactly `LIMIT` 200s and `BURST − LIMIT` 429s.
- **`'gives each worker its own budget when the counters are in memory'`** — the control case. Same scenario with `NODE_RATE_LIMIT_REDIS_URL` explicitly blanked; asserts `LIMIT × WORKERS` 200s. Proves both workers actually served requests, making the first assertion meaningful.
- **`beforeAll` guard** — throws (does not skip) if no container engine or `NODE_TEST_REDIS_URL` is available, treating missing Redis as a fatal test error rather than a skip.

## Relationships

- **`tests/cluster/support/cluster.ts`** — provides `withCluster` (spawns a real multi-worker process cluster with given env), `getOnFreshConnection` (opens a new TCP connection per request), `tally` (counts HTTP status codes), and the `Cluster` type.
- **`tests/cluster/support/redis.ts`** — provides `startRedis` (boots a disposable Redis instance, returns a `TestRedis` handle with `.url` and `.stop()`).
- **`tests/support/container-engine.ts`** — provides `containerEngineAvailable`, used to decide whether the suite can start its own Redis container or must fall back to an externally provided `NODE_TEST_REDIS_URL`.

## Notes

- **Not in `npm run complete`.** Booting two clusters plus a Redis container takes ~40 s total; see `docs/tools/cluster-testing.md` for the rationale.
- **Jest timeout is 240 s** (4 min) to accommodate both cluster boots.
- **The control case explicitly sets `NODE_RATE_LIMIT_REDIS_URL` to `''`.** A developer's `.env` may carry a real URL; leaving it unset would silently put counters back in Redis and turn the control into a duplicate of the fix case.
- **The suite refuses to skip.** The file's docblock argues that an unverified security control is worse than a failing test, so the `beforeAll` throws rather than calling `describe.skip`.
- **Historical bug it pins down:** on first run, `RedisStore.init()` issued two script loads back-to-back; both saw `isReady === false`, both called `connect()`, node-redis rejected the second with "Socket already opened", and the failure path destroyed the shared client — leaving every request unbudgeted while logs reported Redis unreachable. The fix is a shared `connecting` promise in `rate-limit-store.ts`; these two cases are what keep it in place.
