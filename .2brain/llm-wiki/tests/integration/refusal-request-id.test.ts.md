---
source: tests/integration/refusal-request-id.test.ts
sha256: c9677ce8c91bef423cfd6f641c9d3e227717603d0c086a90e66c46781f2c2a42
generated_at: 2026-10-29T07:01:47.335698+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/refusal-request-id.test.ts

## Purpose

Integration test that verifies a 429 response from the global rate limiter still carries an `x-request-id` header and a `cache-control: no-store` header. It exists to lock in the middleware ordering guarantee: the id middleware is mounted before the limiter in `createApp`, so a refused caller always has a request id to quote in a support ticket.

## Key elements

- **`appWithGlobalLimit()`** — Factory that assembles a minimal Express app with the real `requestIdMiddleware` and the real `rateLimiter` (budget = 1 request). Uses `withReloadedRateLimits` to force a fresh module load with `NODE_RATE_LIMIT_MAX: '1'`, then exports the limiter and wires both middlewares before a trivial `GET /anything` route.
- **Test: "answers 429 with an x-request-id"** — Sends two requests; asserts the second is 429 and its `x-request-id` matches a UUID-v4 pattern.
- **Test: "answers 429 as no-store"** — Same two-request pattern; asserts `cache-control: no-store` on the 429, even though no route handler ever executed.
- **`afterEach` → `jest.resetModules()`** — Required so each test gets a clean module registry for the dynamic imports inside `appWithGlobalLimit`.

## Relationships

- **`src/app/request-context.ts`** — Source of `requestIdMiddleware`, imported dynamically after the limiter module reload. The test depends on this middleware running *before* the limiter to prove the header is present on refusals.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Source of `rateLimiter`. Imported via `withReloadedRateLimits` so the test controls the budget without touching global state.
- **`tests/support/rate-limit-harness.ts`** — Provides `withReloadedRateLimits`, which reloads the rate-limit module under a given env override and returns a selected export. Without this helper the budget (fixed at module-load time) could not be constrained per-test.

## Notes

- The rate-limit module captures its budget **once, at import time**. That is the sole reason `withReloadedRateLimits` exists and why the test uses dynamic `import()` rather than a static one.
- The `cache-control: no-store` assertion is non-trivial: no route handler runs for a 429, so the header must be set by middleware (the limiter itself or an upstream security layer), not by application code. The test guards against someone removing that behavior.
- The UUID regex allows both lower- and upper-case hex (`/i` flag).
