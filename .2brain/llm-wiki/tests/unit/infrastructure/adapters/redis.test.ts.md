---
source: tests/unit/infrastructure/adapters/redis.test.ts
sha256: dbcb2d4ee20a9fd982af5677305940b795922f67d30fed8f71440c8007196919
generated_at: 2026-10-15T13:09:12.449864+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/redis.test.ts

## Purpose

Unit tests for the two pure, side-effect-free exports of the Redis adapter module: `isRedisConnectionError` (error classification) and `configuredRedisUrl` (URL assembly from environment variables). Client construction and socket lifecycle are deliberately excluded here because they are exercised indirectly through the cache and rate-limit adapters.

## Key elements

- **`describe('isRedisConnectionError')`** — Verifies the helper returns `true` for each of the five node-redis error classes (`ClientClosedError`, `ClientOfflineError`, `ConnectionTimeoutError`, `SocketClosedUnexpectedlyError`, `SocketTimeoutError`) and `false` for a generic `Error` or `undefined`.
- **`describe('configuredRedisUrl')`** — Asserts the URL is built from `NODE_REDIS_HOST`/`NODE_REDIS_PORT`, that a `NODE_REDIS_PASSWORD` is percent-encoded into the auth segment, and that no credentials appear when the password is unset. Uses `overrideEnvironment` (with a `try/finally` restore) to isolate each case.

## Relationships

- **`src/infrastructure/adapters/redis.ts`** — The module under test. This file imports `isRedisConnectionError` and `configuredRedisUrl` directly and asserts their behavior in isolation.
- **`src/infrastructure/config/store.ts`** — Provides `overrideEnvironment`, the shared helper for temporarily swapping process-environment values so `configuredRedisUrl` can be tested without polluting global state.

## Notes

- All five node-redis error classes report `error.name === 'Error'`; the implementation (and therefore this test) must rely on instanceof or class identity, not the `name` property.
- The expected URL encodes `@`, `/`, and `#` as `%40`, `%2F`, `%23` respectively — a regression here would silently break connections to any Redis instance whose password contains URL-special characters.
- The `NODE_REDIS_URL` env var is explicitly set to `undefined` in each test to guarantee the host/port/password path is exercised rather than the full-URL shortcut.
