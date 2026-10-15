---
source: tests/unit/infrastructure/http/middlewares/rate-limit-build.test.ts
sha256: 4d0b0d49fc53dca620dcf7d1396d094cd85b39a633721c845ceb0a9697cca199
generated_at: 2026-10-15T13:13:14.786201+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-build.test.ts

## Purpose

Unit tests for `buildRateLimiter` and `chargeBudget`, verifying that a declared `RateLimitBudget` correctly becomes a working Express limiter. Covers limit enforcement, window resolution, `skipSuccessfulRequests`, optional hooks (`keyGenerator`, `requestWasSuccessful`, `skip`, `requestPropertyName`), escalation/lockout doubling, and `chargeBudget`'s allow/refund/retry-after semantics. The refusal body and audit trail are pinned separately in `rate-limit.test.ts`; this file focuses on the build path and budget arithmetic.

## Key elements

- **`budgetOf(limit, overrides?)`** – Factory that mints a `RateLimitBudget` with a unique per-test `namespace`, `name`, and `environmentVariable` (via a module-level `sequence` counter). Sets the env var through `setEnvironment` so the in-process store reads the correct limit.
- **`hit(limiter, extra?, statusCode?)`** – Drives one request through the limiter using hand-made Express `Request`/`Response` stubs (from `asStub`). Returns an `Outcome` (`passed`, `status`, `headers`, `request`). Manually fires `finish` listeners on the response to let express-rate-limit settle its success/failure count.
- **`passes(...)`** – Thin wrapper over `hit` that resolves to the boolean `passed` flag.
- **`waitOf(budget, key)`** – Calls `chargeBudget` and returns `retryAfterSeconds`.
- **`fits(budget, key)`** – Calls `chargeBudget` and returns `allowed`.
- **Test suites** – `limit`, `window`, `skipSuccessfulRequests`, `optional hooks`, `escalation`, `store errors` (empty placeholder), `chargeBudget`, and `express-rate-limit warnings`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** – The module under test; imports `buildRateLimiter`, `chargeBudget`, and `rateLimitInfoOf`.
- **`src/infrastructure/http/config.ts`** – Imports `rateLimitConfig` to resolve the shared window value (`NODE_RATE_LIMIT_WINDOW_MS`) asserted in header and retry-after tests.
- **`src/infrastructure/adapters/logger.ts`** – Imports `logger`; spies on `logger.error` to verify that express-rate-limit misconfiguration reports are routed through the application logger.
- **`src/types/rate-limit-budget.ts` / `src/types/index.ts`** – Provides the `RateLimitBudget` type used by `budgetOf` and all budget-literal assertions.
- **`tests/support/stub.ts`** – `asStub` creates the minimal Express `Request`/`Response` objects consumed by `hit`.
- **`tests/support/environment.ts`** – `setEnvironment` / `resetEnvironment` manage per-test env vars (unique limit key) and clean up after each test.

## Notes

- Each test call to `budgetOf` increments a module-level `sequence`, guaranteeing a unique `namespace` and env-var name so no two tests share a counter in the in-process store.
- The `hit` helper intercepts `response.status` to distinguish pass-through (reached `next`) from refusal (status called with 429). It also fires `finish` event listeners after a pass so express-rate-limit can record the request as successful—without this, `skipSuccessfulRequests` refunds would not trigger.
- Time-dependent tests (escalation, minimum retry-after) use `jest.useFakeTimers` with `doNotFake: ['setImmediate', 'nextTick']` because `hit` relies on `setImmediate` to flush async work.
- The `store errors` describe block is intentionally empty as a placeholder for future Redis-failure coverage.
- The suite does **not** assert response body or audit-log content; those are pinned in the companion `rate-limit.test.ts`.
