---
source: tests/integration/refusal-request-id.test.ts
sha256: 12c3279ccc2e89b3b6fc165799cc5d473f6ccd6a19f414fad0463834dc9f0869
generated_at: 2026-11-08T09:46:34.632784+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/refusal-request-id.test.ts

## Purpose

Integration test that verifies a request refused by the global rate limiter (HTTP 429) still carries a valid `x-request-id` header and a `Cache-Control: no-store` response header. It exists to lock in the middleware-ordering contract: the ID middleware is mounted *before* the limiter so that even callers who never reach a route can quote a request ID to support.

## Key elements

- **`appWithGlobalLimit()`** – Async factory that builds a minimal Express app with the *real* `requestIdMiddleware` and the *real* `rateLimiter` configured to allow exactly one request (`NODE_RATE_LIMIT_MAX: '1'`). Uses `withReloadedRateLimits` to re-import the rate-limit module with the overridden env var, then mounts ID middleware → limiter → a trivial 200 GET route.
- **`describe('a rate-limited request', …)`** – Two tests, each making two sequential `supertest` GETs to `/anything`; the second is the 429 refusal.
  - *Test 1*: asserts status 429 and that `x-request-id` matches a standard UUID pattern.
  - *Test 2*: asserts status 429 and that `cache-control` is `no-store`, even though no route handler ever ran to set it.

## Relationships

- **`src/app/request-context.ts`** – Source of `requestIdMiddleware`, imported and mounted first in the test app so it runs before the limiter can short-circuit.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Source of `rateLimiter`; the test reloads this module via the harness to force a budget of 1.
- **`tests/support/rate-limit-harness.ts`** – Provides `withReloadedRateLimits`, which handles the `jest.resetModules()` / dynamic-import dance needed to re-evaluate the limiter with a custom `NODE_RATE_LIMIT_MAX`.

## Notes

- The global rate-limit budget is **fixed at module-load time**; the harness exists solely to work around this by clearing the module registry and re-importing with different env. `afterEach` calls `jest.resetModules()` to prevent leakage between tests.
- Middleware order is the entire point of the file: if `rateLimiter` were mounted before `requestIdMiddleware`, the 429 response would have no ID. The test encodes that invariant.
- The `cache-control: no-store` assertion documents that the header is set by a middleware (not a route handler), so it survives even when the request is refused before any route runs.
