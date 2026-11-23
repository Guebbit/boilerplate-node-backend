---
source: src/modules/account/tests/integration/mail-recipient-budget.test.ts
source_sha256: cc0aff6482e5621dc9c2b40609ebfef04cf895903da0e2bbfb9d247c915b3c5d
context_sha256: ba5331194d3a891aa12ff1b64814efaf99802da2519e7bb86ba00ec43f76894d
generated_at: 2026-11-22T03:57:07.300966+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/mail-recipient-budget.test.ts

## Purpose
Integration tests for the per-recipient mail budget, which caps how much mail can be pointed at a single mailbox per day. This bounds the victim of a mail bomb, which a budget on the caller cannot do. The tests cover every path that can send mail to a third party: two routes whose request body names the address (signup, reset), and three services where the server chooses the recipient (verification resend, pending-email resend, email change).

## Key elements
- `refusals()`: reads the `rate_limit_refusals_total` metric for the `mail-recipient` budget label, returning 0 if there is none.
- `withBudget(limit, body)`: runs `body` with `NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX` overridden to `limit`, via `withEnvironmentOverrides`.
- `routeBehindLimiter()`: calls `jest.resetModules()`, dynamically imports `mailRecipientLimiter`, and returns an Express app with `POST /mail` behind it that answers 200 when allowed.
- `post(app, body)`: sends a request and returns only the status code.
- `describe('the route door …')`: covers the following behaviours.
  - Refusal with 429 once a mailbox has spent its budget.
  - `+tag` and case variants count as one inbox.
  - Gmail dot variants collapse, but only for gmail.com.
  - Other mailboxes are unaffected.
  - A refusal carries `Retry-After`, a `RATE_LIMITED` error body with `details {policy, retryAfter}`, and a `RateLimit` header of the form `"mail-recipient";r=0;t=<retry-after>`. `RateLimit-Policy` is absent.
  - Allowed requests carry no `RateLimit` header.
  - Bodies without a usable address (`{}`, `email: 5`) pass through for validation to handle.
- `describe('the service doors …')`: covers the following behaviours.
  - `accountService.requestEmailVerificationFor` is charged to the account's own mailbox, and its 429 has the same body shape as the route.
  - A refusal from the service increments the refusal metric.
  - `resendPendingEmailVerificationFor` is charged to the pending mailbox.
  - `requestEmailChange` is refused with 429 and saves no `pendingEmail`.
  - An email change to the current or already-pending address returns 409, not 429.

## Relationships
- `src/modules/account/mail-budget.ts`: supplies `mailRecipientLimiter`, the unit under test. It is imported dynamically after a module reset.
- `src/modules/account/services/index.ts`: supplies `accountService`, whose methods are exercised for the service doors.
- `src/infrastructure/observability/metrics-rate-limit.ts`: supplies `rateLimitRefusalsTotal`, read to check that refusals are counted.
- `src/modules/users/tests/factories.ts`: supplies `createUser` and `userRepository`. The repository's `findByIdWithCredentials` is used to confirm that nothing was persisted.
- `src/modules/users/repository.ts`: the underlying user repository, reached through the factories re-export rather than imported directly.
- `tests/support/setup-test-db.ts`: `setupTestDb()` prepares the database.
- `tests/support/environment.ts`: `withEnvironmentOverrides` sets the per-test limit.
- `tests/support/callers.ts`: `testCallerContext` is the caller context passed to the services.
- `tests/support/response.ts`: `asReject` narrows service results to the rejection shape.

## Notes
- `afterEach(() => jest.resetModules())`, along with a reset inside `routeBehindLimiter`, is needed because the store the budget counts in lives in module state. Each test therefore starts with a fresh budget.
- Service-door tests share one budget across different accounts by using `+tag` variants of the same mailbox (e.g. `resend+a@` and `resend+b@`). The second request is the one that gets refused.
- The pending-email resend test spends the budget through two `requestEmailChange` calls before the resend is refused, because the limit is 2.
