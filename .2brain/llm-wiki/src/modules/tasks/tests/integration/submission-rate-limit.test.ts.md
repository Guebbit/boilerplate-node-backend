---
source: src/modules/tasks/tests/integration/submission-rate-limit.test.ts
sha256: c25c67328c480555859d0ea80a1cc7a3ba93777cd236a7ca17a76ca396698b1f
generated_at: 2026-11-14T22:16:59.077440+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/submission-rate-limit.test.ts

## Purpose

Integration test for `submissionLimiter`, the rate-limit middleware on `POST /tasks`. It verifies the limiter spends its budget on **every** request (not just successes, unlike `credentialLimiters`) and that each 429 refusal is logged, since no downstream middleware will record it. The file guards against the regression of accidentally mounting the credential limiter on this endpoint, where every abusive submission returns `201` and the credential limiter's `skipSuccessfulRequests` would silently let all of them through.

## Key elements

- **`submissionLimiterWithBudget(limit)`** — helper that dynamically imports `@modules/tasks/rate-limits` with `NODE_SUBMISSION_RATE_LIMIT_MAX` set to `limit` via the harness, returning the configured `submissionLimiter` instance.
- **`describe('submissionLimiter')`** — three cases:
  - *Spends budget on successful requests* — sends 5 requests through a minimal Express app; expects `201 × 3` then `429 × 2`.
  - *Spends budget on failed requests too* — same shape but the handler returns `422`; expects `422 × 3` then `429 × 2`.
  - *Logs every refusal* — spies on `logger.warn`, asserts it is **not** called after a 200-range success, **is** called after a 429, and receives `POST /tasks`, `method: 'POST'`, `route: '/tasks'`, `statusCode: 429`.
- **`afterEach` → `jest.resetModules()`** — isolates the dynamic `import()` calls between tests.

## Relationships

- **`src/modules/tasks/rate-limits.ts`** — source of the SUT (`submissionLimiter`). Imported dynamically inside `submissionLimiterWithBudget` so the env var is picked up at module-evaluation time.
- **`tests/support/rate-limit-harness.ts`** — provides `withReloadedRateLimits`, the only piece of the harness this file uses. The test deliberately avoids the harness's `appAnswering` helper because the third case asserts the real path string `POST /tasks`, which `appAnswering`'s fixed `/route` would not produce.

## Notes

- Deliberately **not** built on `appAnswering` (from the harness): the log-line assertion needs the literal `POST /tasks`, not a generic `/route`.
- This is the **integration** counterpart to `src/modules/tasks/tests/unit/rate-limits.test.ts`, which covers only pure-configuration properties (default value, relationship to the global budget) without sending HTTP requests.
- The third test's rationale: `installSecurity` mounts limiters **before** `installRequestContext` mounts the request logger, so a 429 never reaches the logger that records every other status code. The limiter itself must emit the only audit trace.
