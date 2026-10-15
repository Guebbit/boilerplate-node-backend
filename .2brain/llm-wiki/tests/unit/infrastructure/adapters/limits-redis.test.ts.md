---
source: tests/unit/infrastructure/adapters/limits-redis.test.ts
sha256: 7b02a03f70a21e88b278b426e7ff91a421c7760b14ba5176f9ed345f3d000c3e
generated_at: 2026-10-15T13:06:51.903492+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/limits-redis.test.ts

## Purpose

Unit tests for the limits Redis adapter, verifying three invariants: (1) it uses only `NODE_RATE_LIMIT_REDIS_URL` and never the cache Redis, (2) a claim is a single `SET NX EX` under the `rate-limit:claim:` namespace, and (3) every claim/lookup function resolves with a safe fallback string or boolean instead of ever rejecting.

## Key elements

- **`mockClient` / `mockCreateClient`** — In-memory stand-ins for the `redis` package, set up via `jest.mock('redis', …)`. All connection and command methods are jest fns so tests can assert exact command arrays.
- **`freshLimits()`** — Calls `jest.resetModules()` then synchronously `require`s the adapter. Required because the adapter memoises its Redis client in module scope; without this every test would share the first client.
- **`describe('limitsRedisUrl')`** — Asserts the URL is read from `NODE_RATE_LIMIT_REDIS_URL` exclusively and returns `undefined` (not the cache URL) when that variable is absent.
- **`describe('claimLimitsKey')`** — Verifies the exact `SET key 1 NX EX ttl` command, the `rate-limit:claim:` prefix, the `'claimed'` / `'taken'` / `'unavailable'` return contract, and that a Redis error triggers `destroy()` and a resolved `'unavailable'` rather than a rejection.
- **`describe('isLimitsKeyClaimed')`** — Verifies a single `EXISTS` read (no write), `true`/`false` for present/absent keys, and `false` as the fallback on missing URL or network failure.
- **`setEnvironment`** (from `tests/support/environment.ts`) — Used in `beforeEach` and individual cases to inject or clear `NODE_RATE_LIMIT_REDIS_URL` and `NODE_RATE_LIMIT_REDIS_PREFIX`.

## Relationships

- **`src/infrastructure/adapters/limits-redis.ts`** — The module under test. Each `freshLimits()` call re-imports it; tests exercise its three exports (`limitsRedisUrl`, `claimLimitsKey`, `isLimitsKeyClaimed`).
- **`tests/support/environment.ts`** — Provides `setEnvironment`, the helper used to set/clear process env vars between test cases without leaking state.

## Notes

- The `redis` and `@infrastructure/adapters/logger` modules are fully mocked; no real socket is ever opened.
- Because the adapter stores its client in a module-level variable, the `jest.resetModules()` + `require()` pattern in `freshLimits()` is mandatory. A plain `import` at the top would only execute once and every subsequent test would see the stale (possibly destroyed) client.
- The eslint-disable for `@typescript-eslint/no-require-imports` is scoped to that single `require` line and is intentional—`jest.resetModules` invalidates the static import graph.
- The adapter's "never reject" contract is the most important behavior under test: every `it` in the failure paths uses `.resolves.toBe(…)` rather than `.rejects`, which is a deliberate assertion that no caller can ever observe a thrown error from this adapter.
