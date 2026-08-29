# tests/unit/infrastructure/http/middlewares/rate-limit-store-selection.test.ts

## Purpose

Unit tests for the `rateLimitStore` factory's **selection and wiring** logic: which concrete store is built (in-process `MemoryStore` vs. `RedisStore`), URL-resolution priority, lazy construction and memoisation, the missing-config alert path, and the init-failure fail-open regression. It is deliberately kept separate from `rate-limit-store.test.ts` because this file mocks `RedisStore` at the class level (via `jest.mock('rate-limit-redis')`) to control `init`/`increment` directly, whereas the sibling file lets a real `RedisStore` run against a fake low-level `redis` client to exercise the `connecting`-promise handshake. One `jest.mock('rate-limit-redis')` per file, so the two strategies cannot coexist in a single file.

## Key elements

- **`freshStore()`** — calls `jest.resetModules()` then synchronously `require()`s the target module, discarding module-scope state (`client`, `connecting`, `degraded`) between tests.
- **`freshLogger()`** / **`freshMemoryStore()`** — same re-require pattern for the logger mock and `express-rate-limit`'s `MemoryStore` class, ensuring `instanceof` checks compare against the *same* module copy the store under test used.
- **`MockRedisStore`** — class-level mock replacing `RedisStore`; its `init` and `increment` are jest spies, but `increment` still delegates to `this.sendCommand` so the `createClient` → `send()` → `build()` chain is exercised rather than short-circuited.
- **`mockCreateClient`** — mock for `redis.createClient`; returns a stub client whose `on`/`connect`/`sendCommand`/`destroy`/`quit` are individually spied.
- **`urlUsedFor()`** — helper that triggers the lazy build, waits for the first `increment`, then reads the URL argument passed to `createClient`.
- **`ORIGINAL_ENVIRONMENT`** — snapshot of the six relevant `process.env` keys; `afterEach` restores them to prevent cross-test leakage.
- **`beforeEach`** — resets `mockSelectionConnect`, `mockInit`, and `mockSelectionSendCommand` to resolving implementations.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — the module under test. Never imported statically; always re-required via `require()` after `jest.resetModules()` so module-scope singletons start fresh each test.
- **`src/infrastructure/adapters/logger.ts`** — mocked at the module level (`jest.mock('@infrastructure/adapters/logger')`) so tests can assert `logger.error` / `logger.warn` calls for the missing-config alert and the init-failure path. Re-required via `freshLogger()` to stay in sync with the fresh module graph.

## Notes

- **Global env default**: the test-suite setup (`tests/support/setup.ts`) sets `NODE_RATE_LIMIT_REDIS_ENABLED ??= '0'`, so every test that exercises the Redis path must explicitly set it to `'1'`.
- **`express-rate-limit` is NOT mocked**: after `jest.resetModules()`, any top-level `import { MemoryStore }` in the test file would be a *different* class copy than the one `rateLimitStore` used internally, making `instanceof` always fail. That is why `freshMemoryStore()` re-requires the package.
- **Init-failure regression**: guards a real bug where `lazyRedisStore` fired `inner.init(options)` without `.catch()`. Since `RedisStore.init` awaits two Lua-script loads, an unhandled rejection would be fatal (Node ≥ 15). The test calls `store.init()` manually (as `express-rate-limit` does before any request) and asserts `increment` still resolves.
- **File-scope `import type`**: the top-level `import type { Options } from 'express-rate-limit'` exists solely to force TypeScript file scope, preventing type-checker collisions with identically-named `const`s in `cache.test.ts`'s copy of the same pattern.
