---
source: tests/cluster/rate-limit.test.ts
sha256: c146f89c03485f04e658cc5e1e3bf108c349268aa90cfd3e621c2665e46a766c
generated_at: 2026-11-08T09:17:48.024767+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/rate-limit.test.ts

## Purpose

Verifies that the rate-limit budget is **shared across all cluster workers** when a Redis store is configured, and deliberately reproduces the per-process bug when it is not. A single-process test cannot distinguish a shared counter from a per-process one, so without this suite a regression back to the in-memory store would pass the entire repository's test run.

## Key elements

- **`LIMIT` (5), `WORKERS` (2), `BURST` (30)** — the three constants that shape both test cases. Chosen so an off-by-one is not the only explanation for a passing/failing assertion.
- **`keyPrefix()`** — returns `cluster-test-<pid>-<timestamp>` so consecutive runs do not collide within Redis's 60-second sliding window.
- **`burstAgainst(cluster)`** — fires `BURST` simultaneous requests, each on a **fresh TCP connection** (via `getOnFreshConnection`), then tallies status codes.
- **`'spends one budget across every worker'`** — the positive assertion: exactly `LIMIT` responses are `200`, the rest `429`, with two workers behind the cluster.
- **`'gives each worker its own budget when the counters are in memory'`** — the control: identical scenario with `NODE_RATE_LIMIT_REDIS_URL` explicitly blanked. Asserts exactly `LIMIT × WORKERS` are `200`, proving both workers actually served traffic (otherwise the positive case would be vacuous).
- **`jest.setTimeout(240_000)`** — 4-minute ceiling for the suite (two cluster boots + Redis container pull).

## Relationships

- **`tests/cluster/support/cluster.ts`** — supplies `withCluster` (forks a real multi-worker app with the given env), `getOnFreshConnection` (opens a one-shot HTTP connection to a port), `tally` (counts status codes), and the `Cluster` type.
- **`tests/cluster/support/redis.ts`** — supplies `startRedis` (boots a Redis instance, either in a container or via `NODE_TEST_REDIS_URL`) and the `TestRedis` type.
- **`tests/support/container-engine.ts`** — `containerEngineAvailable` is checked in `beforeAll`; if neither a container engine nor an explicit Redis URL is available the suite **throws** rather than skips.

## Notes

- **Not in `npm run complete`.** Two cluster boots plus a Redis image pull take roughly 20 s each; see `docs/tools/cluster-testing.md` for the intended invocation path.
- **Refuses to skip.** The `beforeAll` guard throws an error if no Redis can be reached. The rationale (in the file header): an unchecked security control is the entire point of this suite.
- **The control test blanked URL is deliberate.** A developer's local `.env` may carry `NODE_RATE_LIMIT_REDIS_URL`; leaving it unset would silently route counters back to Redis and collapse the control into a duplicate of the positive case.
- **Fresh connections matter.** `getOnFreshConnection` ensures the OS does not round-robin a burst across workers on a single reused socket, which would mask a per-process counter.
- **Historical bug documented in the header:** the first run revealed that `RedisStore.init()` issued two `connect()` calls on the same node-redis client, destroying the socket the first was using. The fix lives in `rate-limit-store.ts` (a shared `connecting` promise); these tests keep it from regressing.
