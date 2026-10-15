---
source: tests/cluster/redis-idle.test.ts
sha256: 0bc98133c01f9a047af1ac0a49ae7c7e9da6acb22f3ebd0ddad69e320ed33548
generated_at: 2026-10-15T12:31:14.419322+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/redis-idle.test.ts

## Purpose

Guards against a specific production bug: node-redis' `socketTimeout` is an *idle* timer, so without a keepalive ping a healthy shared client gets closed after one quiet second and the cache layer reports it as `unavailable` between requests. This test proves the client created by the production adapter survives past that 1 s ceiling and still answers a `PING`.

## Key elements

- **`IDLE_MS` (2500)** — sleep duration set deliberately above the 1 s idle ceiling; a client lacking the keepalive would already be disconnected by this point.
- **`beforeAll`** — starts a real Redis via the test support helper, builds a client with `createRedisClient`, attaches a no-op `error` listener, and calls `connect()`.
- **`afterAll`** — closes the client with `closeRedisClient` and stops the Redis instance.
- **`'stays ready past its idle ceiling and still answers'`** — waits `IDLE_MS`, then asserts `client.isReady === true` and that `ping()` resolves to `'PONG'`.

## Relationships

- **`src/infrastructure/adapters/redis.ts`** — source of `createRedisClient`, `closeRedisClient`, and the `RedisClient` type. The test exercises the exact client the application adapter produces.
- **`tests/cluster/support/redis.ts`** — provides `startRedis` and the `TestRedis` type to spin up and tear down a real Redis process for the test.

## Notes

- The error listener (`client.on('error', () => undefined)`) is intentional: it suppresses unhandled-rejection noise in the test runner without masking a real failure, since the test asserts readiness explicitly.
- This is an integration test against a **real** Redis process, not a mock; it must be run in the cluster test suite where the support helper is available.
- The module docblock doubles as the bug description; if the keepalive logic in the adapter changes, update that comment to keep the "why" in sync.
