---
source: src/modules/account/tests/integration/mail-recipient-budget.test.ts
sha256: 206c63f1cb35c4b7f2e7573ee3f42c77c5f62c05b685cbac2550661fb6ec023f
generated_at: 2026-10-29T02:57:12.627140+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/mail-recipient-budget.test.ts

## Purpose

Integration test for the per-recipient mail rate-limit budget. It verifies that the limiter correctly caps the *recipient* mailbox (not the caller) across every code path that can target a stranger's inbox: the two body-addressed routes (signup, reset) and the three server-chosen-recipient services (verification resend, pending-email resend, email change). It also pins down the canonical-mailbox keying (e.g. `+tag` and Gmail-dot folding) that prevents a mail-bomb from bypassing the budget.

## Key elements

- **`refusals()`** — Reads the `rate_limit_refusals_total` metric and extracts the value for `labels.budget === 'mail-recipient'`; used to assert that a refusal was actually recorded.
- **`withBudget(limit, body)`** — Runs `body` with `NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX` set to `limit` via environment overrides, giving each test a deterministic daily cap.
- **`routeBehindLimiter()`** — Builds a throwaway Express app whose single `POST /mail` route is guarded by `mailRecipientLimiter`; calls `jest.resetModules()` first so the in-memory budget store starts fresh.
- **`post(app, body)`** — Supertest helper that returns only the numeric status code.
- **`describe('the route door — signup and reset')`** — Tests 429 after budget exhaustion, `+tag`/casing/Gmail-dot canonicalization, per-mailbox isolation, `Retry-After` header + `RATE_LIMITED` error code, and pass-through when the body has no valid address.
- **`describe('the service doors — the recipient is chosen by the server')`** — Exercises `accountService.requestEmailVerificationFor`, `resendPendingEmailVerificationFor`, and `updateProfile` (email change) under the same budget; verifies metric increments, that refused changes persist no state, and that no-op changes (same as current or already-pending) do not consume budget.

## Relationships

- **`src/modules/account/mail-budget.ts`** — Source of `mailRecipientLimiter`, the Express middleware under test in the route-door block.
- **`src/modules/account/services/index.ts`** — Provides `accountService`, the object whose methods are the SUT in the service-door block.
- **`src/infrastructure/observability/metrics-rate-limit.ts`** — Exports `rateLimitRefusalsTotal`, the Prometheus metric the test reads to confirm refusals were counted.
- **`src/modules/users/repository.ts`** — `userRepository.findByIdWithCredentials` is used to assert a refused email change wrote nothing.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds test accounts with specific email/verified states.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` injects the budget limit per test.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity to `accountService` calls.
- **`tests/support/response.ts`** — `asReject` unwraps the service-layer error object for assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory database before the suite runs.

## Notes

- The budget store is **module-scoped in-memory state**, so `routeBehindLimiter()` calls `jest.resetModules()` before re-importing `mail-budget`. The top-level `afterEach(jest.resetModules)` is a safety net but the explicit reset inside the helper is what makes each route-door test independent.
- Canonicalisation is provider-specific: Gmail dots (`v.i.c.tim@gmail.com`) fold to one inbox, but dots at other providers (`v.ictim@example.com`) do **not**. Tests assert both directions.
- A body with no parseable address (`{}` or `{ email: 5 }`) must pass *through* the limiter (status 200) so downstream validation can produce the proper error; the limiter does not reject on its own.
- No-op email changes (setting `pendingEmail` to the already-pending or the current address) must not decrement the budget — the test sets budget to 1, performs one real change, then confirms two more "changes" still succeed.
