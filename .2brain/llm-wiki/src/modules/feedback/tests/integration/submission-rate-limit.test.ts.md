---
source: src/modules/feedback/tests/integration/submission-rate-limit.test.ts
sha256: 29c966500bf955cf9ad551777a087d5dff0152af4bb989cb06c2b19ee786a264
generated_at: 2026-09-23T18:42:22.785007+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/submission-rate-limit.test.ts

## Purpose

Integration test for `submissionLimiter` that verifies the contact-form budget is consumed by **every** request (success or failure) and that each 429 refusal is logged. It guards the regression where someone accidentally mounts `credentialLimiters` (which use `skipSuccessfulRequests`) on `POST /feedback/contact`, where every abusive submission returns `201` and would therefore spend zero of the budget.

## Key elements

- **`submissionLimiterWithBudget(limit)`** — helper that reloads the rate-limits module with `NODE_SUBMISSION_RATE_LIMIT_MAX` set to `limit` and returns the `submissionLimiter` instance. Built on `withReloadedRateLimits` from the shared harness.
- **"spends the budget on a SUCCESSFUL request"** — sends 5 requests through a real Express + `express-rate-limit` setup; asserts the first 3 get `201`, the last 2 get `429`.
- **"also spends the budget on a FAILED request"** — same loop but the handler returns `422`; confirms the limiter counts failures too (budget is not success-gated).
- **"logs every refusal, since nothing downstream will"** — asserts `logger.warn` is called with the real method/route/status on a 429, because `installSecurity` mounts the limiter *before* the request-logger, so the normal per-request log never fires for a refused request.

## Relationships

- **`src/modules/feedback/rate-limits.ts`** — the module under test. The helper imports it (via `withReloadedRateLimits`) and pulls out `submissionLimiter`.
- **`tests/support/rate-limit-harness.ts`** — provides `withReloadedRateLimits`, which swaps the `NODE_SUBMISSION_RATE_LIMIT_MAX` env var, resets the Jest module registry, re-imports the rate-limits module, and returns the requested export.

## Notes

- Deliberately **not** built on the harness's `appAnswering` helper: that helper pins the route to `/route`, but the logging test asserts the log message contains the real path `POST /contact`.
- Lives in **integration** (not unit) because it exercises `express-rate-limit`'s middleware with real HTTP requests via `supertest`. The sibling `tests/unit/rate-limits.test.ts` covers pure configuration properties.
- `afterEach` calls `jest.resetModules()` to prevent budget state from leaking between the three test cases.
- The logging test mocks `logger.warn` and restores it in-line (`warn.mockRestore()`), rather than in an `afterEach`, so the spy is scoped to that single test.
