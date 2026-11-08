---
source: tests/cluster/redis-idle.test.ts
sha256: 0bc98133c01f9a047af1ac0a49ae7c7e9da6acb22f3ebd0ddad69e320ed33548
generated_at: 2026-11-08T09:17:56.416870+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/redis-idle.test.ts

## Purpose

Integration test that verifies a Redis client created by the production adapter stays connected and responsive after sitting idle longer than node-redis' `socketTimeout` ceiling. It guards against a regression where the absence of a keepalive ping causes a healthy client to self-close and the cache to report `unavailable` between requests.

## Key elements

- **`IDLE_MS`** (2500) — wait duration chosen to exceed the 1 s idle ceiling, guaranteeing a no-keepalive client would have dropped by then.
- **`describe('the shared Redis client, idle')`** — spins up a real Redis via the test harness, creates a client with `createRedisClient`, attaches a no-op error handler, and connects once in `beforeAll`. Tears down in `afterAll`.
- **`it('stays ready past its idle ceiling and still answers')`** — sleeps for `IDLE_MS`, then asserts `client.isReady === true` and that `client.ping()` resolves to `'PONG'`.

## Relationships

- **`src/infrastructure/adapters/redis.ts`** — source of `createRedisClient`, `closeRedisClient`, and the `RedisClient` type used throughout the test. The test exercises the adapter's connection lifecycle (including any internal keepalive logic).
- **`tests/cluster/support/redis.ts`** — provides `startRedis` / `TestRedis` to launch a real Redis instance on an ephemeral port for the test, and `redis.stop()` for teardown.

## Notes

- This is an integration test (real Redis, real socket), not a unit test; it requires the test-Redis harness to be available.
- `client.on('error', () => undefined)` is attached deliberately to swallow any transient error event emitted during the idle window so it doesn't fail the process.
- The module docblock makes the *why* explicit: without a keepalive ping, node-redis treats 1 s of silence as a dead connection. If you change the adapter's keepalive interval, keep `IDLE_MS` comfortably above it.
