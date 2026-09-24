---
source: tests/cluster/rate-limit.test.ts
sha256: 8e1980ca6df258796bf108cbda42cb92d9c6ae240d202d464af88326b4337d70
generated_at: 2026-09-23T19:51:03.599509+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/rate-limit.test.ts

## Purpose

Verifies that the rate limiter enforces a single shared budget across all worker processes when backed by Redis, and includes a deliberate control case that reproduces the per-process (in-memory) behavior to prove the first assertion is actually exercising multi-worker distribution. Without this suite, a regression to the in-memory store would pass every other test in the repository, because all other suites run a single process.

## Key elements

- **`LIMIT` / `WORKERS` / `BURST`** — constants: budget of 5, two workers, 30 concurrent requests.
- **`keyPrefix()`** — returns a Redis key prefix unique per run (`pid` + timestamp) so a second invocation within the 60 s window does not read a partially-spent budget from the first.
- **`burstAgainst(cluster)`** — fires `BURST` requests, each on a fresh TCP connection, then calls `tally` to count 200/429 responses.
- **`"spends one budget across every worker"`** — boots a 2-worker cluster with Redis enabled; asserts exactly `LIMIT` × 200 and `BURST − LIMIT` × 429.
- **`"gives each worker its own budget when the counters are in memory"`** — control: same scenario with Redis disabled and `NODE_REDIS_URL` blanked; asserts exactly `LIMIT × WORKERS` × 200. Proves the burst genuinely hit both workers.
- **`beforeAll` / `afterAll`** — start/stop a Redis instance; throws (does not skip) if neither a container engine nor `NODE_TEST_REDIS_URL` is available.

## Relationships

- **`tests/cluster/support/cluster.ts`** — supplies `withCluster` (boots a multi-worker app process), `getOnFreshConnection` (opens an individual TCP connection to a given port), `tally` (reduces response codes into a count map), and the `Cluster` type.
- **`tests/cluster/support/redis.ts`** — supplies `containerEngineAvailable`, `startRedis`, and the `TestRedis` type used to provision and tear down the shared Redis instance.

## Notes

- **Refuses to skip.** If no Redis can be started the suite throws in `beforeAll` rather than silently passing. The rationale (in the docblock) is that a silent skip would mask the exact security regression the suite guards against.
- **Excluded from `npm run complete`.** Two cluster boots plus a Redis image pull take ~20 s each; see `docs/tools/cluster-testing.md` for the full rationale.
- **`NODE_REDIS_URL` is explicitly blanked** in the memory-store test. The limiter falls back to the cache's Redis URL when its own is unset, so leaving it set would silently re-enable the shared store and turn the control into a duplicate of the first case.
- **Jest timeout is 240 s** (`jest.setTimeout(240_000)`) to accommodate cluster boot.
- **Fresh connection per request.** `getOnFreshConnection` ensures the OS may route each request to a different worker; a single reused socket could land every request on one worker and mask the multi-process behavior.
- The top-of-file docblock records a real bug this suite caught on first run: a race in `RedisStore.init()` where two back-to-back script loads both saw `isReady === false` and called `connect()` on the same node-redis client, destroying it mid-use and leaving the limiter unbudgeted. The shared `connecting` promise in `rate-limit-store.ts` is the fix these cases keep in place.
