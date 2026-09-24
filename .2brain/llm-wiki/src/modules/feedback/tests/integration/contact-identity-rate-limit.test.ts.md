---
source: src/modules/feedback/tests/integration/contact-identity-rate-limit.test.ts
sha256: 7dc89365cd5b7a4e7803f7c1d696fe4642c29d2bcbd2ff1d041e7a46d360d815
generated_at: 2026-09-23T18:41:39.192803+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/contact-identity-rate-limit.test.ts

## Purpose

Integration test for the identity-keyed dimension of the contact-form rate limiter (`contactLimiters`). It verifies that the submitted-email budget (`NODE_SUBMISSION_RATE_LIMIT_EMAIL_MAX`) is enforced independently of the per-address budget, and that the limiter is actually wired into the `POST /feedback/contact` route. The per-address-only case is covered in `submission-rate-limit.test.ts`.

## Key elements

- **`withFeedbackRateLimits`** – Local helper that binds `withReloadedRateLimits` to the feedback rate-limits module, letting each test reload the module with different `NODE_SUBMISSION_RATE_LIMIT_*` env overrides.
- **`describe('contactLimiters')`** – Unit-level integration test using `appAnswering` (a trivial handler from the harness). Confirms that 3 requests from the same email hit the `EMAIL_MAX` ceiling (201, 201, 429) while a second email still succeeds.
- **`describe('mounted on the real routes')`** – Spins up the real DB (`setupTestDb`) and hits `POST /feedback/contact` via the `api` helper. Asserts the `ratelimit` response header is present, proving the limiter array actually reached the route.
- **`afterEach(() => jest.resetModules())`** – Required so each `withFeedbackRateLimits` call re-imports the module fresh with its overrides.

## Relationships

- **`src/modules/feedback/rate-limits.ts`** – The module under test; dynamically imported (via `import()` inside `withFeedbackRateLimits`) so Jest's module registry can be reset between tests.
- **`tests/support/rate-limit-harness.ts`** – Provides `withReloadedRateLimits` (env-override + module-reload machinery), `appAnswering` (builds a minimal Express app from a limiter array), and `statusOf` (extracts HTTP status from a supertest response).
- **`tests/support/http.ts`** – Provides `api()`, the supertest agent bound to the real Express app, used for the mounted-route test.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb()`, which configures the test database so the real-route test can run without a live environment.

## Notes

- The identity test intentionally uses a trivial handler (`appAnswering`) rather than the real contact controller — the property under test belongs to the limiter, not the route.
- `jest.resetModules()` in `afterEach` is load-bearing: without it, the dynamic `import()` inside `withFeedbackRateLimits` would return the cached module and env overrides would be ignored.
- The mounted-route test only checks for the presence of the `ratelimit` header (draft-7 format); it does not assert specific limit values.
