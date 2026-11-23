---
source: src/modules/account/tests/integration/email-change-door.test.ts
source_sha256: 810733b365cc264582ec18eb4b73a3e070eb13c1582e87cc9ca8e1ea35bc1820
context_sha256: c1d65024c1ad156bda2196b15a1e48b0037a44b7b8e02d767279a86314c92827
generated_at: 2026-11-22T03:54:22.991820+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/email-change-door.test.ts

## Purpose
Integration test for `POST /account/email-change`, the single entry point for starting an email address change. It pins the unconditional step-up (fresh login) requirement, the repeat-request rules (current, pending, replaced, taken addresses), the two mails sent, and the audit event. It also checks that `PUT`/`PATCH /account` now reject an `email` field. The proof for accounts armed with an `otp` second factor lives in `step-up-otp.test.ts`.

## Key elements
- **`jest.mock` of `@infrastructure/observability/audit`**: replaces the audit port with `auditPortMock()` from `@tests/ports`, rather than spying on it.
- **`mockOutbox` and the mocked `enqueueEmail`**: the mailer module is mocked so `enqueueEmail` records `{ to, template }` into an in-memory array. The rest of the real mailer module is kept.
- **`mailsTo(to, template)`**: counts queued mails of one template sent to one address.
- **`requestChange(bearer, email)`**: sends `POST /account/email-change` with a bearer token.
- **`pendingOf(userId)`**: reads `pendingEmail` from the stored user via `userRepository.findByIdWithCredentials`.
- **`describe('POST /account/email-change')`** covers:
  - Success: returns 200 with `email` and `pendingEmail`, sends `account.email-change-notice` to the old address and `account.verify-request` to the new one, and emits an audit event with outcome `success`.
  - A stale session returns 401 `REAUTH_REQUIRED` even without a second factor, saving nothing and sending no mail.
  - No session returns 401.
  - The current address, compared case-insensitively, returns 409 `EMAIL_ALREADY_CURRENT`.
  - The pending address returns 409 `EMAIL_CHANGE_ALREADY_PENDING`, with no further mail.
  - A different address after 61 seconds replaces the pending one (200).
  - A different address inside the minute returns 429 `EMAIL_CHANGE_TOO_SOON`, and the first pending address is kept.
  - An address held by another account returns 409 `EMAIL_ALREADY_USED`.
  - Invalid bodies (empty, malformed address, extra key) return 422.
- **`describe('PUT and PATCH /account no longer take an email')`**: both methods return 422 when given an `email`. The PATCH case also checks that nothing was changed.

## Relationships
- `tests/support/http.ts`: `api`, `loginBearer` and `staleBearerFor(user, 'sensitive')` drive requests and build fresh or stale sessions.
- `tests/support/setup-test-db.ts`: `setupTestDb()` provides the database lifecycle.
- `tests/support/environment.ts`: `setEnvironment` sets `NODE_MAIL_TRANSPORT: 'outbox'` before each test.
- `tests/support/clock.ts`: `freezeDate` and `advanceDate` control time for the replace-after-a-minute case.
- `tests/support/ports.ts`: `auditPortMock` replaces the audit port, and `observePort` watches `emitAuditEvent`.
- `src/infrastructure/observability/audit.ts`: the audit port that is mocked, and whose `emitAuditEvent` is asserted on.
- `src/modules/account/audit.ts`: supplies `accountAuditActions`, whose `AUTH_EMAIL_CHANGE_REQUESTED` action the audit assertion expects.
- `src/modules/users/tests/factories.ts`: supplies `createUser` and `userRepository`.
- `src/modules/users/repository.ts`: not imported directly. It is reached through the factories' `userRepository`.

## Notes
- `afterEach` restores real timers with `jest.useRealTimers()`, so the `freezeDate()` call in one test does not leak into the next.
- The outbox is cleared in `beforeEach`. Tests also clear it mid-test (`mockOutbox.length = 0`) to isolate the mails from the second request.
- Error assertions read the code from `response.body.errors[0].code`.
