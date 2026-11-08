---
source: tests/unit/infrastructure/http/middlewares/rate-limit-build.test.ts
sha256: ee4b61a80b95a412175707873c604f093120166c05bbb2762a0c0d27ceb90c3d
generated_at: 2026-11-08T10:15:21.055039+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-build.test.ts

## Purpose

Unit tests for `buildRateLimiter` and `chargeBudget` from the rate-limit middleware. Verifies how a declared `RateLimitBudget` translates into a working Express limiter: enforcing limits, emitting draft-11 `RateLimit` headers, handling windows, skipping successful requests, keying strategies, escalation lockouts, and budget charging. Driven through hand-crafted Express request/response stubs and an in-process store (the Redis URL is blanked via the environment helper).

## Key elements

- **`budgetOf(limit, overrides?)`** – Builds a `RateLimitBudget` with a unique `namespace` and `environmentVariable` (via a module-level `sequence` counter) so no test case shares a counter or limit with another.
- **`hit(limiter, extra?, statusCode?)`** – Core driver. Creates a stubbed `Request`/`Response` via `asStub`, invokes the limiter, and returns an `Outcome` (`passed`, `status`, `headers`, raw `request`/`response`). Manually fires `finish` listeners on the response to simulate Express lifecycle for the library's success/failure accounting.
- **`passes(...)`** – Thin wrapper over `hit` that returns only the boolean result.
- **`waitOf(budget, key)`** – Calls `chargeBudget` and returns `retryAfterSeconds`.
- **`fits(budget, key)`** – Calls `chargeBudget` and returns `allowed`.
- **`sequence`** – Module-level integer incremented per `budgetOf` call to guarantee namespace isolation.
- **`afterEach`** – Calls `resetEnvironment()` to clear the env vars set by `budgetOf`.
- **Describe blocks** – `the limit`, `the window`, `skipSuccessfulRequests`, `optional hooks`, `escalation` (uses `jest.useFakeTimers`), `store errors` (currently empty), `chargeBudget`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Imports `buildRateLimiter`, `chargeBudget`, and `rateLimitInfoOf`; the primary subject under test.
- **`src/infrastructure/http/config.ts`** – Imports `rateLimitConfig` to read `NODE_RATE_LIMIT_WINDOW_MS` for the shared-window test.
- **`src/infrastructure/adapters/logger.ts`** – Imports `logger` (available for potential spy/expectation on audit logging).
- **`src/types/index.ts` / `src/types/rate-limit-budget.ts`** – Provides the `RateLimitBudget` type used by `budgetOf` and throughout the suite.
- **`tests/support/stub.ts`** – `asStub` creates the typed Express `Request`/`Response` mocks used by `hit`.
- **`tests/support/environment.ts`** – `setEnvironment` / `resetEnvironment` manage the per-test env var that holds the numeric limit, and clean up after each case.

## Notes

- The file's header comment states that refusal **body** and **audit** assertions live in a separate `rate-limit.test.ts`; this file only covers the limiter build path and header output.
- The `store errors` describe block is intentionally empty as a placeholder.
- Escalation tests use `jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })` so the async microtask queue still runs; real timers are restored in a `finally` block.
- The `hit` helper intercepts `response.status` to detect a refusal (429 path) before the normal stub logic, since only the refusal handler calls `status().json()`.
- Header assertions check that **no** `X-RateLimit-*` headers are emitted and that the caller's IP or partition key never appears in the response (privacy pin).
