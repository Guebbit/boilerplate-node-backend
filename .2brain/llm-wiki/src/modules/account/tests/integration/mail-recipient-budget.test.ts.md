---
source: src/modules/account/tests/integration/mail-recipient-budget.test.ts
sha256: 019fcb85173bc37b5746ead20780b9caa17465604107f68f02b18eb714718c0d
generated_at: 2026-10-14T09:10:50.969515+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/mail-recipient-budget.test.ts

## Purpose

Integration tests for the per-recipient mail rate limiter. Verifies that the daily budget is keyed to the **canonical mailbox** (not the raw string), covering both the "route door" (client-supplied address in signup/reset bodies) and the "service door" (server-chosen recipient in verification resend, pending-email resend, and email-change flows). Exists to prove the limiter stops a mail-bomb victim while leaving bystanders untouched.

## Key elements

- **`withBudget(limit, body)`** – Wraps a test body in `withEnvironment` so `NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX` is set to `limit` for the duration.
- **`routeBehindLimiter()`** – Builds a throwaway Express app with `mailRecipientLimiter` mounted on `POST /mail`; returns a 200 when the request passes.
- **`post(app, body)`** – Minimal supertest helper; returns only the numeric status code.
- **`describe('the route door — signup and reset')`** – Tests that the limiter fires on the 3rd request to the same canonical mailbox, that `+tag`/case variants collapse, that Gmail dots collapse (non-Gmail dots do not), that a `Retry-After` + `RATE_LIMITED` error is returned, and that bodies lacking a valid email pass through for validation.
- **`describe('the service doors — the recipient is chosen by the server')`** – Tests that verification resend, pending-email resend, and email-change each charge the *recipient's* mailbox (not the caller's), that a refused change persists nothing, and that no-op changes (same or already-pending address) do not consume budget.

## Relationships

- **`src/modules/account/mail-budget.ts`** – Source of `mailRecipientLimiter`, the middleware under test. Imported dynamically after `jest.resetModules()` so the in-module budget store is fresh.
- **`src/modules/account/services/index.ts`** – Provides `accountService` (`.requestEmailVerificationFor`, `.resendPendingEmailVerificationFor`) exercised in the service-door tests.
- **`src/modules/account/services/profile.ts`** – Provides `updateProfile`, the email-change path tested for budget charging and no-op behavior.
- **`src/modules/users/repository.ts`** – `userRepository.findByIdWithCredentials` is used to assert that a refused email change left no `pendingEmail` persisted.
- **`src/modules/users/tests/factories.ts`** – `createUser` factory for seeding accounts with specific emails/verification state.
- **`tests/support/environment.ts`** – `withEnvironment` scopes the `NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX` env var to a single test.
- **`tests/support/callers.ts`** – `testCallerContext` supplies a valid caller for service-level calls.
- **`tests/support/response.ts`** – `asReject` narrows a result to its error shape for asserting status/`errors[0].code`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` is invoked at module load to prepare the test database.

## Notes

- The budget store is **module-level state**; `jest.resetModules()` runs in `afterEach` *and* is called again inside `routeBehindLimiter` before the dynamic import. Forgetting either reset causes cross-test budget bleed.
- Canonicalization rules tested: lowercase, `+tag` stripped, Gmail dots stripped. Non-Gmail dots are **not** stripped (`v.ictim@example.com` ≠ `victim@example.com`).
- A body with no `email` field (or a non-string value like `5`) passes the limiter and is expected to be rejected downstream by validation—this test only asserts the limiter doesn't block it.
- The `Retry-After` header value is asserted to be ≥ 1 (seconds), not an exact value.
