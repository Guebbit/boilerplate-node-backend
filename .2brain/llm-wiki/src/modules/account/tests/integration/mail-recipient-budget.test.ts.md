---
source: src/modules/account/tests/integration/mail-recipient-budget.test.ts
sha256: 206c63f1cb35c4b7f2e7573ee3f42c77c5f62c05b685cbac2550661fb6ec023f
generated_at: 2026-11-08T04:38:24.873611+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/mail-recipient-budget.test.ts

## Purpose

Integration tests for the per-recipient mail rate-limit budget. Verifies that all five code paths capable of pointing mail at a third party (signup route, reset route, verification resend, pending-email resend, email change) enforce a daily cap keyed on the **victim's canonical mailbox**, not the caller. The central security property under test is that `+tag` aliases, casing, and Gmail-dot variants of one inbox are all counted against the same budget.

## Key elements

- **`refusals()`** – Reads the `rate_limit_refusals_total` metric and returns the counter where `labels.budget === 'mail-recipient'`. Used to assert that a refusal actually incremented the shared metric.
- **`withBudget(limit, body)`** – Runs `body` inside `withEnvironmentOverrides` with `NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX` set to `limit`. All rate-limit assertions are relative to this.
- **`routeBehindLimiter()`** – After a `jest.resetModules()`, dynamically imports `mailRecipientLimiter` and mounts it on a minimal Express app (`POST /mail`). Simulates the signup/reset route path.
- **`post(app, body)`** – Supertest wrapper that POSTs to `/mail` and resolves the HTTP status code.
- **`describe('the route door')`** – Five tests covering: budget exhaustion, `+tag`/casing canonicalisation, Gmail-dot folding (and non-Gmail exclusion), per-mailbox isolation with `Retry-After` / error-code assertions, and pass-through of unparseable bodies.
- **`describe('the service doors')`** – Five tests covering: verification-resend charging, metric increment on refusal, pending-email resend exhaustion, email-change refusal with no state persisted (`pendingEmail` stays `undefined`), and no-op changes not consuming budget.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/mail-budget.ts` | Source of `mailRecipientLimiter`, the Express middleware under test in the route-door tests. |
| `src/modules/account/services/index.ts` | Source of `accountService` whose methods (`requestEmailVerificationFor`, `resendPendingEmailVerificationFor`, `updateProfile`) are the entry points for the service-door tests. |
| `src/infrastructure/observability/metrics-rate-limit.ts` | Provides `rateLimitRefusalsTotal`; tests read it to confirm the shared counter was incremented. |
| `src/modules/users/repository.ts` | `userRepository.findByIdWithCredentials` is queried after a refused email-change to assert no `pendingEmail` was persisted. |
| `src/modules/users/tests/factories.ts` | `createUser` factory for building accounts with specific emails and `verifiedAt` states. |
| `tests/support/environment.ts` | `withEnvironmentOverrides` – sets `NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX` per test. |
| `tests/support/callers.ts` | `testCallerContext` – the authenticated caller passed to every `accountService` call. |
| `tests/support/response.ts` | `asReject` – unwraps a rejected service result to assert status and error code. |
| `tests/support/setup-test-db.ts` | `setupTestDb` – initialises the in-test database (called once at module scope). |

## Notes

- **Module-state reset is critical.** The budget store lives in module-level state. `afterEach` calls `jest.resetModules()`, and `routeBehindLimiter` calls it again before its dynamic import. Omitting either causes budgets to leak between tests.
- **Canonicalisation is asymmetric.** Gmail dots collapse (`v.i.c.tim@gmail.com` ≡ `victim@gmail.com`), but dots at other providers do not. `+tag` and casing are stripped at all providers. This is the core invariant the tests pin down.
- **Budget is per-victim, not per-caller.** Every test deliberately uses two or more distinct accounts targeting the same mailbox, proving the limiter keys on the recipient address in the request body or server-side resolution, not the authenticated caller.
- **The env var is the only knob.** `NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX` is the sole configuration the tests touch; there is no per-test store reset needed beyond the module reset.
