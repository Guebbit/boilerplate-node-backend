---
source: tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts
sha256: f86c792589a5b147597da90568ec8c13611e177ecdd435bbe819f5e5443b1524
generated_at: 2026-11-08T10:16:14.448652+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts

## Purpose

Fast, dependency-free guard for two rate-limiter store regressions: (1) a duplicate `connect()` race that corrupts the shared Redis client on the first request, and (2) two same-keyed budgets on one route being misreported as `ERR_ERL_DOUBLE_COUNT`. Exists because the cluster suite that covers the same property is too slow and container-heavy for the contributor's daily `npm test` gate.

## Key elements

- **`fakeClient()`** – factory returning a mock Redis client whose `connect()` throws `'Socket already opened'` on a second call while the first is in-flight, and whose `isReady` getter stays `false` until a 10 ms timer resolves. `sendCommand` answers `'a-fake-sha'` for `SCRIPT` and `[1, 60_000]` otherwise, matching `rate-limit-redis`'s expected reply shapes.
- **`seam`** (`globalThis.rateLimitFakeClient`) – mutable handle that bridges the hoisted `jest.mock` factory to the per-test fake client, working around `jest.mock` hoisting above all `const` declarations.
- **`jest.mock('redis', …)`** – replaces `createClient` so the real `redis` package is never loaded.
- **`connectCalls`** – module-level counter incremented inside `fakeClient().connect`; the primary assertion target.
- **`describe('the rate limiter's Redis connection')`** – three tests: one `connect()` for two concurrent commands; no `destroy()` on the shared client; zero `connect()` when no Redis URL is set.
- **`describe('payment budgets keyed on the same account…')`** – one integration-shaped test that mounts `attempt` and `decline` limiters on an Express route, issues a real `fetch` to a port-0 listener, and asserts the logger never reports `ERR_ERL_DOUBLE_COUNT`.
- **`asAccount(id)`** – tiny Express middleware that stubs `request.authContext` with the given `id`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** – the system under test; `rateLimitStore('unit')` is instantiated and driven in every test.
- **`src/infrastructure/adapters/limits-redis.ts`** – `stopLimitsRedis()` is called in `afterEach` to tear down the adapter's connection state between tests.
- **`src/types/auth-context.ts` / `src/types/index.ts`** – `AuthContext` type is imported (via the `@types` barrel) to type the stubbed `request.authContext`.
- **`tests/support/environment.ts`** – `setEnvironment` swaps `NODE_RATE_LIMIT_REDIS_URL` between the "Redis configured" and "no Redis" test branches.
- **`tests/support/rate-limit-harness.ts`** – `withReloadedRateLimits` reloads the payments rate-limit module in a clean module registry with a specific env var, returning the two limiter instances under test.
- **`tests/support/stub.ts`** – `asStub<AuthContext>` wraps a partial object into a typed value for the `asAccount` middleware.

## Notes

- **`jest.mock` hoisting workaround:** the mock factory cannot reference a module-scoped `const`; the fake client is passed through `globalThis.rateLimitFakeClient` so the factory reads it at call time. Forgetting to set `seam.rateLimitFakeClient` in `beforeEach` will cause `createClient` to return `undefined`.
- **`store.init()` is cast `as never`:** the test file intentionally skips the full options type because it only exercises the connection path, not the limiter configuration surface.
- **The double-count test uses a real `http.Server` + `fetch`** (port 0) rather than supertest, because it needs to exercise the actual Express middleware chain and the store's `prefix` logic; the comment in-file notes a unit test may not boot the full app.
- **The Redis URL in the double-count test points at port 1** (guaranteed unreachable) so the counters fall back to in-memory counting, yet the store wrappers—and therefore the `prefix` distinction—are the same code path a working Redis would use.
- **`connectCalls` is module-level and reset in `beforeEach`**, not scoped per-test. A test that forgets the reset will see a cumulative count.
