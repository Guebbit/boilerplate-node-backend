---
source: src/modules/tickets/tests/integration/submission-rate-limit.test.ts
sha256: 303169af1fa7d40bf2b4a7a6b2543f6cfde4feea188eb97e55d24bd1123dce5a
generated_at: 2026-10-29T06:08:00.403368+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/integration/submission-rate-limit.test.ts

## Purpose

Integration test for `submissionLimiter`, the rate-limit budget on `POST /tickets` (contact form). It sends real requests through `express-rate-limit` middleware via `supertest` to verify three behaviors: the budget is spent on successful requests (the opposite of `credentialLimiters`), it is also spent on failed requests, and every refusal is logged via `logger.warn` because no downstream middleware records a 429. It lives in the integration suite (not the unit suite) because it exercises the middleware end-to-end rather than inspecting pure configuration.

## Key elements

- **`submissionLimiterWithBudget(limit)`** — helper that calls `withReloadedRateLimits` to reload `@modules/tickets/rate-limits` with `NODE_SUBMISSION_RATE_LIMIT_MAX` set to the given number, then returns the resulting `submissionLimiter` instance.
- **`describe('submissionLimiter')`** — the suite (three tests). Calls `jest.resetModules()` in `afterEach` to clear the module registry between cases.
  - *"spends the budget on a SUCCESSFUL request…"* — 5 POSTs to a 201-returning route; asserts first 3 are `201`, last 2 are `429`.
  - *"also spends the budget on a FAILED request…"* — same shape but the handler returns `422`; asserts first 3 are `422`, last 2 are `429`.
  - *"logs every refusal, since nothing downstream will"* — budget of 1; spies on `logger.warn`; asserts no call after the first (successful) request, then a `warn` call containing `'POST /contact'` and `{ method: 'POST', route: '/contact', statusCode: 429 }` after the second.

## Relationships

- **`src/modules/tickets/rate-limits.ts`** — the module under test. `submissionLimiter` is imported (dynamically, inside the harness callback) and mounted as Express middleware.
- **`tests/support/rate-limit-harness.ts`** — supplies `withReloadedRateLimits`, which reloads the rate-limits module with a specific env-var override and returns the chosen export.

## Notes

- Deliberately does **not** use the harness's `appAnswering` helper: the third test asserts the logged path is the real `POST /contact`, which `appAnswering`'s fixed `/route` cannot reproduce.
- The regression guarded here: if `credentialLimiters` (which set `skipSuccessfulRequests`) were mistakenly mounted on `/contact`, every abusive 201 response would be invisible to the limiter. This test would catch that.
- The "every request counts" test (second case) is the key differentiator from the credential limiters: a 422 still consumes budget.
