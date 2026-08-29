# tests/cluster/rate-limit.test.ts

## Purpose

Verifies that the application's rate-limit budget is enforced as a **single shared allowance** across all worker processes when backed by Redis, and demonstrates (as a control) that without Redis each worker independently grants its own budget. Exists because every other test suite runs the app in one process, where a per-process counter is indistinguishable from a shared one — so a regression to the in-memory store would pass all other tests silently.

## Key elements

- **`LIMIT` (5), `WORKERS` (2), `BURST` (30)** — fixed constants: small budget, two forked workers, and a burst large enough to expose splitting.
- **`keyPrefix()`** — returns `cluster-test-<pid>-<timestamp>`; isolates Redis keys per run so a second invocation within the same 60 s window doesn't read the first run's spent budget.
- **`burstAgainst(cluster)`** — fires `BURST` concurrent requests, each on a fresh TCP connection (`getOnFreshConnection`), and returns a status-code tally.
- **`it('spends one budget across every worker')`** — the primary assertion: exactly `LIMIT` responses are 200 and the rest are 429, regardless of which worker handled the socket.
- **`it('gives each worker its own budget when the counters are in memory')`** — the control: with Redis disabled, asserts exactly `LIMIT × WORKERS` 200s, proving both workers served traffic *and* that per-process counters double the allowance.
- **`jest.setTimeout(240_000)`** — 4-minute timeout; booting two clusters plus a Redis container is slow.

## Relationships

- **`tests/cluster/support/cluster.ts`** — provides `startCluster` (forks N workers of the app), `getOnFreshConnection` (opens a single TCP connection to the cluster's port and returns the response), `tally` (aggregates status codes into a map), and the `Cluster` type. The test never touches the app directly; all HTTP goes through these helpers.
- **`tests/cluster/support/redis.ts`** — provides `containerEngineAvailable` (checks for podman/docker or `NODE_TEST_REDIS_URL`), `startRedis` (spins up a throwaway Redis container and returns a `TestRedis` handle with `.url` and `.stop()`). The test suite refuses to run without a reachable Redis rather than skipping.

## Notes

- **Not part of `npm run complete`.** Two cluster boots plus a Redis image pull take ~20 s each; see `docs/tools/cluster-testing.md` for the rationale and manual invocation steps.
- **Refuses to skip.** If no container engine and no `NODE_TEST_REDIS_URL` are available, `beforeAll` throws. The rationale: an unchecked security control is precisely what this file guards against.
- **`NODE_REDIS_URL` must be blanked in the control test.** The limiter falls back to the cache's Redis URL when its own is unset; leaving `NODE_REDIS_URL` set would silently re-enable the shared store and turn the control into a duplicate of the primary case.
- **Past bug guarded here:** `RedisStore.init()` once issued two concurrent script loads, each calling `connect()` on the same node-redis client; the second was rejected and its failure path destroyed the client the first was still using. The shared `connecting` promise in `rate-limit-store.ts` is the fix; these two cases are what keep it fixed.
- **Fresh connections matter.** Each request in the burst uses its own TCP connection (`getOnFreshConnection`) so the OS is free to hand any socket to any worker. Reusing a single socket would pin all traffic to one worker and mask the splitting.
