---
source: tests/unit/infrastructure/http/middlewares/rate-limit-store-selection.test.ts
sha256: ba1271c5f8a5fb4265d28ef17da176dba6bca617926565c2955852c110762fbf
generated_at: 2026-09-27T16:07:20.052783+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-store-selection.test.ts

## Purpose

Tests the `rateLimitStore` factory function for store-selection logic: which store (in-process `MemoryStore` vs. `RedisStore`) is built, the URL-resolution priority chain, lazy Redis construction, the missing-config alert, and the fail-open behaviour when `RedisStore.init` rejects. Deliberately kept separate from `rate-limit-store.test.ts` because it mocks `RedisStore` itself (one `jest.mock('rate-limit-redis')` per file) rather than driving a real Lua-script round-trip through a fake low-level client.

## Key elements

- **`ORIGINAL_ENVIRONMENT`** — snapshot of six `NODE_*` env vars, restored in `afterEach` for isolation.
- **`mockSelectionClient` / `mockCreateClient`** — stand-in for the `redis` package's `createClient`, letting tests assert which URL string was passed at construction time.
- **`MockRedisStore`** — replaces `rate-limit-redis`'s `RedisStore`; records constructor args (for prefix assertions) and exposes controllable `init` / `increment` mocks while still calling `this.sendCommand` so the production call-chain is exercised.
- **`freshStore()`** — `jest.resetModules()` + `require('@infrastructure/http/middlewares/rate-limit-store')` to discard module-scope state (`client`, `connecting`, `degraded`).
- **`freshLogger()`** — same re-require pattern for the logger mock, so assertions hit the same instance the SUT used.
- **`freshMemoryStore()`** — re-requires `express-rate-limit`'s `MemoryStore` so `instanceof` compares against the same module copy the SUT actually imported.
- **`urlUsedFor()`** — helper that triggers one `increment` and returns the `url` field from the most recent `createClient` call.
- **Test suites** — "which store gets built", "the missing-config alert", "URL resolution priority", "an init failure fails open instead of crashing (regression)".

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — the module under test. The file imports (freshly) `rateLimitStore` and asserts on the store it returns, the prefix it builds, and the URL handed to the Redis client.
- **`src/infrastructure/adapters/logger.ts`** — mocked at the module boundary. Tests assert that `logger.error` is called (with `{ namespace: … }`) when Redis is unconfigured and `NODE_CLUSTER_WORKERS > 1`, and that it is *not* called for a single worker or on the init-failure path.

## Notes

- **Module-scope state pattern.** The SUT keeps `client`, `connecting`, and `degraded` at module level, so every test case must re-import via `jest.resetModules()` + `require()`. This is the same pattern used in `cache.test.ts`.
- **Global env default.** The suite's `tests/support/setup.ts` sets `NODE_RATE_LIMIT_REDIS_ENABLED ??= '0'`; any test exercising the Redis path must explicitly set it to `'1'`.
- **`instanceof` across module copies.** Because `jest.resetModules()` re-instantiates `express-rate-limit`, a top-level `import { MemoryStore }` would be a *different* class than the one the SUT uses. `freshMemoryStore()` avoids a spurious `false` on every `toBeInstanceOf` check.
- **Fail-open regression guard.** The last suite protects against an unhandled rejection from `inner.init(options)` (fired without `.catch()` inside `lazyRedisStore`). Since Node 15, unhandled rejections are fatal; the test asserts that `increment` still resolves even while `init` is rejecting on the same tick.
- **Empty-string env values.** The URL-priority suite explicitly tests that an empty `NODE_RATE_LIMIT_REDIS_URL` is treated as unset, matching how `.env` files serialise absent variables.
