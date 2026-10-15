---
source: src/modules/feedback/tests/integration/submission-rate-limit.test.ts
sha256: 0ce85855d1eb961715bdd480136090e67988f03f0d02fb64e97dc6d186c0eefe
generated_at: 2026-10-15T10:33:08.140977+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/submission-rate-limit.test.ts

## Purpose

Integration test for `submissionLimiter`, the rate-limit budget on `POST /feedback/contact`. It sends real HTTP requests through the `express-rate-limit` middleware (via `supertest`) to verify that the limiter counts *every* request—success or failure—and that each 429 refusal is logged, since nothing downstream records it.

## Key elements

- **`submissionLimiterWithBudget(limit)`** — Local helper that calls `withReloadedRateLimits` to re-import `@modules/feedback/rate-limits` with `NODE_SUBMISSION_RATE_LIMIT_MAX` set, returning the `submissionLimiter` instance.
- **`describe('submissionLimiter')`** — Three test cases:
  1. Budget is spent on successful (201) responses; 4th and 5th requests return 429.
  2. Budget is spent on failed (422) responses as well; same 3-then-429 pattern.
  3. A 429 refusal is logged via `logger.warn` with the real path `POST /contact`, method, route, and status code in the payload.
- **`afterEach(() => jest.resetModules())`** — Ensures each test gets a fresh module graph after `withReloadedRateLimits` mutates the import cache.

## Relationships

- **`src/modules/feedback/rate-limits.ts`** — The module under test; this file imports `submissionLimiter` from it (dynamically, after reload).
- **`tests/support/rate-limit-harness.ts`** — Provides `withReloadedRateLimits`, which the helper uses to inject a specific `NODE_SUBMISSION_RATE_LIMIT_MAX` value before the dynamic import.
- **`@infrastructure/adapters/logger`** — Dynamically imported in the log-assertion test; the test spies on `logger.warn` to confirm the refusal trace.

## Notes

- This file intentionally does **not** use the harness's `appAnswering` helper because the third test asserts the log line names the real path `POST /contact`, which the harness's fixed `/route` cannot provide.
- The limiter spends on *all* responses (success and failure), the opposite of `credentialLimiters`' `skipSuccessfulRequests` option. This is the regression the first test guards: mounting credential limiters on `/contact` would count zero meaningful requests because abusive submissions return 201.
- The log assertion exists because `installSecurity` mounts limiters *before* `installRequestContext` mounts the request logger, so a 429 never reaches the standard status-logging path. The limiter itself must emit the audit line.
