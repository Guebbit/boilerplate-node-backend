---
source: tests/cluster/rate-limit.test.ts
sha256: c146f89c03485f04e658cc5e1e3bf108c349268aa90cfd3e621c2665e46a766c
generated_at: 2026-10-15T12:31:05.270588+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/rate-limit.test.ts

## Purpose

Cluster-level integration test that proves the rate limiter enforces **one** shared budget across all worker processes when counters live in Redis, and (as a control) demonstrates the per-worker doubling that occurs with the default in-memory store. It exists because no single-process test can distinguish a shared counter from a per-process one, so a regression to the in-memory store would otherwise pass every test in the repository.

## Key elements

- **`LIMIT` (5), `WORKERS` (2), `BURST` (30)** — sizing constants. Small enough for a fast burst, large enough that an off-by-one isn't the distinguishing factor.
- **`keyPrefix()`** — returns a unique Redis key prefix (`cluster-test-<pid>-<timestamp>`) so a second run within the 60 s sliding window doesn't inherit the first run's already-spent budget.
- **`burstAgainst(cluster)`** — fires `BURST` concurrent requests, each on a fresh TCP connection, and returns a tally of status-code counts.
- **`beforeAll`** — starts a throwaway Redis (via container engine or `NODE_TEST_REDIS_URL`) and **throws** if neither is available; the suite refuses to skip.
- **Test 1 — "spends one budget across every worker"** — boots a 2-worker cluster pointed at Redis; asserts exactly `LIMIT` 200s and `BURST − LIMIT` 429s.
- **Test 2 — "gives each worker its own budget when the counters are in memory"** — same scenario with `NODE_RATE_LIMIT_REDIS_URL` explicitly blanked; asserts exactly `LIMIT × WORKERS` 200s. Acts as the control that proves the burst truly reached both workers.

## Relationships

- **`tests/cluster/support/cluster.ts`** — provides `withCluster` (boots an N-worker app instance with given env), `getOnFreshConnection` (opens a new socket so the OS may route it to any worker), `tally` (counts status codes), and the `Cluster` type.
- **`tests/cluster/support/redis.ts`** — provides `startRedis` (spins up a throwaway Redis container or connects to `NODE_TEST_REDIS_URL`) and the `TestRedis` type used for cleanup in `afterAll`.
- **`tests/support/container-engine.ts`** — provides `containerEngineAvailable`, checked in `beforeAll` to decide whether a container engine (podman/docker) can be used to start Redis.

## Notes

- **Jest timeout is 240 s** — booting two clusters plus pulling a Redis image is not quick.
- **Excluded from `npm run complete`** — see `docs/tools/cluster-testing.md` for how to run it.
- **Refuses to skip.** If neither a container engine nor `NODE_TEST_REDIS_URL` is set, the test throws rather than being silently skipped, because an unverified security control is worse than a red test.
- **Test 2 blanks the Redis URL explicitly.** A developer's `.env` may carry `NODE_RATE_LIMIT_REDIS_URL`; leaving it unset would silently route counters back to Redis and make the control case a duplicate of test 1.
- **Documented bug caught.** On first run, 30/30 requests returned 200 against a budget of 5. Root cause: `RedisStore.init()` issued two back-to-back script loads, both saw `isReady === false`, and each called `connect()` on the same node-redis client; the second was rejected with "Socket already opened" and its failure path destroyed the client the first was still using. The fix is the shared `connecting` promise in `rate-limit-store.ts`; these tests keep it fixed.
