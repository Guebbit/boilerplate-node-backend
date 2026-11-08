---
source: tests/unit/infrastructure/adapters/limits-redis.test.ts
sha256: 7b02a03f70a21e88b278b426e7ff91a421c7760b14ba5176f9ed345f3d000c3e
generated_at: 2026-11-08T10:07:42.471947+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/limits-redis.test.ts

## Purpose

Unit tests for the limits Redis adapter, asserting three invariants: (1) the adapter uses only `NODE_RATE_LIMIT_REDIS_URL` and never falls back to the cache Redis connection, (2) a claim is exactly one `SET NX EX` namespaced under the limits prefix, and (3) every claim function resolves with a safe fallback string rather than rejecting on failure.

## Key elements

- **`freshLimits()`** — Helper that calls `jest.resetModules()` then synchronously `require`s the adapter, discarding its module-scoped memoised client so each test gets a fresh connection.
- **`mockClient` / `mockCreateClient`** — Stubs for the `redis` package (`createClient`, `sendCommand`, `connect`, `destroy`, `close`). Mocked at module level via `jest.mock('redis')`.
- **`describe('limitsRedisUrl')`** — Verifies the URL resolver returns the limits-specific env var and returns `undefined` (not the cache URL) when only the cache Redis is configured.
- **`describe('claimLimitsKey')`** — Asserts the `SET NX EX` command shape, the `'claimed'` / `'taken'` / `'unavailable'` outcome strings, and that a Redis error resolves to `'unavailable'` while calling `destroy` on the client.
- **`describe('isLimitsKeyClaimed')`** — Asserts a single `EXISTS` read (no writes), `true`/`false` mapping, and that both a missing URL and a Redis failure resolve to `false`.

## Relationships

- **`src/infrastructure/adapters/limits-redis.ts`** — The module under test. Imported exclusively through `freshLimits()` so the memoised client is reset between cases.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used in every test to control `NODE_RATE_LIMIT_REDIS_URL` and `NODE_RATE_LIMIT_REDIS_PREFIX` in isolation.

## Notes

- The adapter memoises its Redis client in module scope; the `resetModules` + `require` dance in `freshLimits()` is the only reliable way to get a clean instance per test. The `eslint-disable` comment is intentional.
- Both `redis` and `@infrastructure/adapters/logger` are fully mocked at the top of the file, so no real network or log I/O occurs.
- The "no inheritance" test deliberately sets `NODE_REDIS_URL` / `NODE_REDIS_PORT` alongside an absent limits URL to prove the cache connection is never dialled.
