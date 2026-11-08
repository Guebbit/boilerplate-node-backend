---
source: tests/unit/infrastructure/adapters/redis.test.ts
sha256: 129f631f1f17fe07300fd120ba94c5d7534656a5d7b400f922558941afbe6fcc
generated_at: 2026-11-08T10:10:14.704253+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/redis.test.ts

## Purpose

Unit tests for the two pure, socket-free functions exported by `src/infrastructure/adapters/redis.ts` — `isRedisConnectionError` and `configuredRedisUrl`. These are tested in isolation because the remaining logic in that module (client construction, close) is exercised indirectly through the cache/rate-limit adapters that actually open a socket.

## Key elements

- **`describe('isRedisConnectionError')`** — Verifies the guard recognises each of the five real node-redis error classes (`ClientClosedError`, `ClientOfflineError`, `ConnectionTimeoutError`, `SocketClosedUnexpectedlyError`, `SocketTimeoutError`) and rejects a generic `Error` and `undefined`.
- **`describe('configuredRedisUrl')`** — Verifies URL assembly from `NODE_REDIS_HOST`/`NODE_REDIS_PORT`, password encoding (`p@ss/w#d` → `p%40ss%2Fw%23d`), and the credential-less form when `NODE_REDIS_PASSWORD` is unset.

## Relationships

- **`src/infrastructure/adapters/redis.ts`** — The module under test. The file imports `configuredRedisUrl` and `isRedisConnectionError` directly.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, which injects/overrides `NODE_REDIS_URL`, `NODE_REDIS_HOST`, `NODE_REDIS_PORT`, and `NODE_REDIS_PASSWORD` for each `configuredRedisUrl` test case.
- **`redis` (node-redis package)** — Source of the five error class instances used as inputs to `isRedisConnectionError`.

## Notes

- The comment at the top makes the scoping intent explicit: client lifecycle is *not* tested here; it belongs to the adapter-level tests.
- `NODE_REDIS_URL` is set to `undefined` in both `configuredRedisUrl` tests, confirming that the host/port/password path is the one under test (a pre-set full URL would bypass the assembly logic).
- The `it.each` table uses real error instances, not mocks, so the test asserts behaviour against the actual class identities thrown by node-redis at runtime.
