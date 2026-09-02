# tests/integration/submission-rate-limit.test.ts

## Purpose

Integration test that verifies `submissionLimiter` (the rate limiter guarding `POST /feedback/contact`) spends its budget on **successful** requests — the inverse of `credentialLimiters`, which skip them. It exists as a regression guard for `FEEDBACK_PLAN.md` correction 1: mounting the wrong limiter on `/contact` would silently pass every abusive submission because they all return `201`.

## Key elements

- **`submissionLimiterWithBudget(limit: number)`** — sets `NODE_SUBMISSION_RATE_LIMIT_MAX`, calls `jest.resetModules()`, dynamically re-imports `submissionLimiter` so the limit is re-captured, then restores the original env var.
- **`describe('submissionLimiter')`** — the test suite; calls `jest.resetModules()` in `afterEach`.
- **Test: "spends the budget on a SUCCESSFUL request"** — fires 5 requests expecting `201` against an Express app with the limiter; asserts the first three succeed and the last two get `429`.
- **Test: "also spends the budget on a FAILED request"** — same setup but the handler returns `422`; asserts the limiter still counts every request, not just 2xx.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — the module under test; this file imports `submissionLimiter` from it (via the `@infrastructure/http/middlewares/rate-limit` alias).
- **`tests/unit/infrastructure/http/middlewares/rate-limit.test.ts`** (referenced in comments) — covers the pure-configuration aspects (default budget, relation to global budget); this integration file covers the *behavioral* property of counting successful requests.
- **`auth-hardening.test.ts`** (referenced in comments) — shares the same env-var / `resetModules` recipe for `credentialLimiters`.

## Notes

- Placed in the **integration** suite (not unit) because it drives real HTTP requests through `express-rate-limit`'s middleware via `supertest`.
- The limit value is **captured at module import time**, which is why every test must go through `submissionLimiterWithBudget` rather than mutating the already-imported instance.
- The distinguishing contract under test: `submissionLimiter` does **not** set `skipSuccessfulRequests`; `credentialLimiters` do. This asymmetry is the entire reason this file exists.
