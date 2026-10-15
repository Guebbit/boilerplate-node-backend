---
source: src/modules/payments/tests/integration/rate-limit-double-count.test.ts
sha256: 63578e8fd39fb4bd96978c0553bc720a6ac13f5f09d80f12a50fe023f0cbf0c3
generated_at: 2026-10-15T11:34:27.520646+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/rate-limit-double-count.test.ts

## Purpose

Integration test verifying that the two rate-limit budgets (attempt and decline) mounted on `POST /payments/:id/confirm` are treated as separate counters by `express-rate-limit`, and that the pair does not trigger an `ERR_ERL_DOUBLE_COUNT` error. It exercises the real store wrappers with an intentionally unreachable Redis URL to force the in-memory fallback path.

## Key elements

- **`asAccount(id)`** — Express middleware stub that attaches a minimal `AuthContext` (via `asStub`) to `request.authContext`, simulating what `getAuth` would resolve. Only `.id` is consumed downstream.
- **`describe` / single `it`** — Builds a bare Express app with the two limiters (`paymentConfirmAttemptLimiter`, `paymentConfirmDeclineLimiter`) in sequence, fires one `supertest` POST, and asserts the `logger.error` spy never recorded `ERR_ERL_DOUBLE_COUNT`.
- **`withReloadedRateLimits`** call — Reloads `@modules/payments/rate-limits` with `NODE_RATE_LIMIT_REDIS_URL` set to `redis://127.0.0.1:1` (unreachable by design) and extracts the two limiter exports.
- **Logger spy** — `jest.spyOn(logger, 'error')` intercepts and collects any `code` or `message` from thrown `Error` instances into a `reported` array for the final assertion.

## Relationships

- **`tests/support/rate-limit-harness.ts`** — Supplies `withReloadedRateLimits`, which handles module-cache reset, env injection, and re-importing the rate-limit module so the limiters are constructed against the given Redis URL.
- **`tests/support/stub.ts`** — Supplies `asStub<T>`, used to create the minimal `AuthContext` object attached to the request.
- **`src/types/index.ts`** / **`src/types/auth-context.ts`** — Provide the `AuthContext` type that `asStub<AuthContext>` constrains; the test relies on `.id` being the only field read by the `accountIdOf` keying logic.

## Notes

- The Redis URL `127.0.0.1:1` is deliberately unreachable. The test does **not** require a running Redis; it exercises the same store wrapper code paths that a working Redis would, just with an in-memory counter underneath.
- `afterEach` calls both `jest.restoreAllMocks()` and `jest.resetModules()` — the latter is required because `withReloadedRateLimits` mutates the module registry.
- The assertion is purely negative (the error code must be *absent*); the test does not verify that rate limiting actually throttles subsequent requests.
- The Express app is intentionally minimal (no auth middleware, no payment service calls) — the sole purpose is to let both limiters run against the same request in the same order as production.
