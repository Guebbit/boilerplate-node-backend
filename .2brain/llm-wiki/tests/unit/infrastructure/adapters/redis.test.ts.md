---
source: tests/unit/infrastructure/adapters/redis.test.ts
sha256: c53c342e79497ea660989ed1bac95c84d75b81b4c8380428cfb0eeed18ee2f8e
generated_at: 2026-09-27T16:05:51.638016+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/redis.test.ts

## Purpose

Unit test for the single exported predicate `isRedisConnectionError`. This file exists because that helper is the one pure, easily isolated fact in the Redis adapter module; the rest of the module (client construction, close lifecycle) is exercised indirectly through the cache and rate-limit adapters that actually open sockets.

## Key elements

- **`describe('isRedisConnectionError')`** — single test suite scoped to the one function under test.
- **`it.each([...])('recognises %p', ...)`** — parameterised positive test covering all five node-redis error classes that the predicate must accept: `ClientClosedError`, `ClientOfflineError`, `ConnectionTimeoutError`, `SocketClosedUnexpectedlyError`, `SocketTimeoutError`.
- **Negative case (`'is false for an ordinary error, and for nothing at all'`)** — asserts the predicate returns `false` for a generic `Error` and for `undefined`.

## Relationships

- **`src/infrastructure/adapters/redis.ts`** — the module under test. This file imports `isRedisConnectionError` from it and validates its return value.
- **`redis` (npm package)** — source of the five error classes instantiated in the positive test cases.

## Notes

- All five Redis error classes report `.name === 'Error'` (not their own class name), so the predicate under test cannot rely on `error.name` for discrimination.
- The file's own header comment explicitly justifies the narrow scope: client construction and close are *not* tested here because they require a live socket and are covered by the higher-level cache/rate-limit adapter tests.
- Imports use the `@infrastructure/…` path alias rather than a relative path, consistent with the project's tsconfig aliases.
