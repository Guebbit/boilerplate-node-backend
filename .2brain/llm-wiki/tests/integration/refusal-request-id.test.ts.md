---
source: tests/integration/refusal-request-id.test.ts
sha256: 6e36201b82d41cb3baaad7df55c9ca09286298dde154296bc651f6d3dcf8077b
generated_at: 2026-10-15T12:52:11.087176+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/refusal-request-id.test.ts

## Purpose

Integration test verifying that a request refused by the global rate limiter (429) still carries the `x-request-id` header. This matters because the id middleware is mounted before the limiter in `createApp`, so the header is the only identifier a refused caller (or a support ticket) can quote. The test drives the real limiter and the real id middleware in a minimal Express app.

## Key elements

- **`appWithGlobalLimit()`** – Factory that assembles a throwaway Express app: the real `requestIdMiddleware` first, then the real `rateLimiter` configured to allow exactly one request (`NODE_RATE_LIMIT_MAX: '1'`). Uses `withReloadedRateLimits` to inject that env var at module-load time.
- **`it('answers 429 with an x-request-id', …)`** – Fires two sequential GETs via `supertest`; asserts the second returns 429 and that its `x-request-id` header matches the UUIDv4 pattern.
- **`afterEach(() => jest.resetModules())`** – Clears the module registry after each test so the next run can reload the rate-limit module with fresh budget state.

## Relationships

- **`src/app/request-context.ts`** – Supplies `requestIdMiddleware`, the Express middleware that generates and sets the `x-request-id` response header. Imported dynamically inside `appWithGlobalLimit`.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Supplies `rateLimiter`, the global rate-limit middleware whose budget is fixed at module-load time. Loaded via `withReloadedRateLimits` so the test can pin the limit to 1.
- **`tests/support/rate-limit-harness.ts`** – Supplies `withReloadedRateLimits`, a helper that re-imports a module with overridden `process.env` values and returns the named export. Necessary because the limiter caches its budget on first import.

## Notes

- All imports inside `appWithGlobalLimit` are **dynamic** (`await import(…)`). This is intentional: the rate-limit module reads its budget once at load, so a static import would lock in the production default. `withReloadedRateLimits` + `jest.resetModules` together make each test get a fresh, controllable budget.
- The regex in the assertion pins the header to UUIDv4 format; a format regression (e.g., switching to a nanoid) would fail the test even if the header is present.
- The test intentionally does **not** test the access-log path or the ordering inside `createApp`; it only proves the two middlewares cooperate in the minimal composition that mirrors production ordering.
