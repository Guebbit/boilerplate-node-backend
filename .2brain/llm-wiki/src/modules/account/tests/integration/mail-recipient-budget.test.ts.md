---
source: src/modules/account/tests/integration/mail-recipient-budget.test.ts
sha256: 43a00d898eea4cc424e5b89697dc5a6203690122f816f4f1d51d67df3b6fa128
generated_at: 2026-11-14T19:05:11.209970+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/mail-recipient-budget.test.ts

## Purpose

Integration tests for the per-recipient mail rate-limit budget. They exercise every entry point that can direct mail at a chosen address — the two body-addressed routes (signup, reset) and the three server-chosen service paths (verification resend, pending-email resend, email change) — verifying that the budget tracks the canonical mailbox, that refusals carry consistent metadata (status, `Retry-After`, body, `RateLimit` header), and that no state is persisted when a request is refused.

## Key elements

- **`refusals()`** — Reads the `rateLimitRefusalsTotal` metric and returns the count where `labels.budget === 'mail-recipient'`, used to assert that a service-level refusal was tallied.
- **`withBudget(limit, body)`** — Runs `body` under a `NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX` environment override so each test controls its daily cap.
- **`routeBehindLimiter()`** — Builds a minimal Express app with `mailRecipientLimiter` mounted on `POST /mail`; the handler returns 200, so any non-200 is the limiter's doing. Calls `jest.resetModules()` first to get a fresh budget store.
- **`post(app, body)`** — Shorthand for a supertest POST that returns only the status code.
- **`describe('the route door — signup and reset')`** — Six tests covering: budget exhaustion at the cap, `+tag`/casing normalization, Gmail dot-variant folding (and non-Gmail non-folding), `Retry-After` + `RateLimit` header + body consistency on refusal, absence of budget headers on allowed requests, and pass-through of addressless/malformed bodies to validation.
- **`describe('the service doors — the recipient is chosen by the server')`** — Five tests covering: verification resend charged to the account's own mailbox, refusal count increment in the metric, pending-email resend charged to the pending mailbox, email-change refusal leaving `pendingEmail` unset, and 409 (duplicate/conflict) being answered by service logic rather than the budget's 429.

## Relationships

- **`src/modules/account/mail-budget.ts`** — Source of `mailRecipientLimiter`, the Express middleware mounted by `routeBehindLimiter()`.
- **`src/modules/account/services/index.ts`** — Source of `accountService`, whose `requestEmailVerificationFor`, `requestEmailChange`, and `resendPendingEmailVerificationFor` methods are the "service door" targets.
- **`src/infrastructure/observability/metrics-rate-limit.ts`** — Source of `rateLimitRefusalsTotal`, the Prometheus-style counter read by `refusals()`.
- **`src/modules/users/repository.ts`** — Source of `userRepository`, used to assert that a refused email-change did not persist `pendingEmail`.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` (with optional `verifiedAt`, `pendingEmail` overrides) for seeding accounts.
- **`tests/support/callers.ts`** — Provides `testCallerContext` passed to every `accountService` call.
- **`tests/support/environment.ts`** — Provides `withEnvironmentOverrides`, the mechanism behind `withBudget`.
- **`tests/support/response.ts`** — Provides `asReject` to unwrap the `{ status, errors }` rejection envelope returned by services.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb`, called once at the top to initialise the in-memory test database.

## Notes

- `jest.resetModules()` is called both in `afterEach` and inside `routeBehindLimiter()` because the budget's in-memory store lives in module state; without the reset, successive tests (or successive `routeBehindLimiter()` calls within a test) would share the same counter.
- The Gmail dot test deliberately asserts that dot-variants are **not** folded for non-Gmail domains (`v.ictim@example.com` ≠ `victim@example.com`), pinning the normalisation rule to the provider.
- The "saves nothing" test is the key correctness guarantee: the budget check fires *before* `requestEmailChange` writes `pendingEmail`, so a 429 leaves the user record untouched.
- The final service-door test (409 vs 429) documents that domain-level rejections (same-as-current, already-pending) are the service's own concern and must not be conflated with rate-limit refusals.
