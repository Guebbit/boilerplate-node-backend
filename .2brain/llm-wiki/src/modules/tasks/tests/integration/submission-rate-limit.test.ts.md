---
source: src/modules/tasks/tests/integration/submission-rate-limit.test.ts
sha256: 7aa40a049c338b65c953db4a9d56ee18f28318743e8b9fe46ebb30c801120d30
generated_at: 2026-11-08T08:40:29.521001+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/submission-rate-limit.test.ts

## Purpose

Integration tests for `submissionLimiter`, the rate-limit budget applied to `POST /contact`. Verifies that the limiter spends its budget on both successful and failed responses (the opposite of `credentialLimiters`, which use `skipSuccessfulRequests`) and that every 429 refusal is logged with the real request path. Lives in the integration suite because it drives real requests through `express-rate-limit`'s middleware; the unit suite only checks pure configuration values.

## Key elements

- **`submissionLimiterWithBudget(limit)`** — local helper that dynamically re-imports `@modules/tasks/rate-limits` with `NODE_SUBMISSION_RATE_LIMIT_MAX` overridden, then returns `module.submissionLimiter`.
- **`describe('submissionLimiter')`** block containing three tests:
  - *Spends budget on a successful request* — 5 `POST /contact` calls against a 201 handler; expects `201, 201, 201, 429, 429`.
  - *Spends budget on a failed request* — same shape but the handler returns 422; confirms every request counts, not just 2xx.
  - *Logs every refusal* — budgets to 1, spied on `logger.warn`; asserts the first call logs nothing and the second calls `warn` with a message containing `POST /contact` and a context object `{ method: 'POST', route: '/contact', statusCode: 429 }`.
- **`afterEach(() => jest.resetModules())`** — resets the module registry so each test's dynamic import picks up fresh env.

## Relationships

- **`src/modules/tasks/rate-limits.ts`** — the module under test; `submissionLimiter` is the exported middleware being exercised.
- **`tests/support/rate-limit-harness.ts`** — provides `withReloadedRateLimits`, used to inject a custom `NODE_SUBMISSION_RATE_LIMIT_MAX`. The harness's `appAnswering` helper is intentionally *not* used (see Notes).

## Notes

- The third test hard-codes `POST /contact` in its log assertion, which is why the test cannot use the harness's `appAnswering` (that helper mounts a fixed `/route`). If the real path changes, this test must be updated in tandem.
- The file's block comment documents a regression: mounting `credentialLimiters` (which skip 2xx) on a contact form would count zero of the abusive requests, since every submission returns 201. This test pins the opposite behavior for `submissionLimiter`.
- The limiter is mounted *before* the request-context logger in the real app (`installSecurity` runs first), so 429s never reach the downstream logger. The `warn` call in the limiter is the only trace of a refusal; this test guards that invariant.
