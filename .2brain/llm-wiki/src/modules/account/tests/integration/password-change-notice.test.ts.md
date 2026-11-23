---
source: src/modules/account/tests/integration/password-change-notice.test.ts
source_sha256: dccddfe71ba5de195d20dfa7f06e9252e3440dd589de723918985cdb8a81c782
context_sha256: 53ce292188bdcf9d76be1571ca5a6131177fb0211b8a9e1a9c4df663e2b0458d
generated_at: 2026-11-22T03:58:05.902432+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/password-change-notice.test.ts

## Purpose
Integration test for the out-of-band mail sent after a signed-in password change. It checks that exactly one `account.password-changed` mail goes to the account on success, and that no such mail is sent for refused changes or for password resets (which send their own mail).

## Key elements
- `mockOutbox`: array capturing every queued mail (`to`, `template`, `data`). Prefixed `mock*` because `jest.mock` is hoisted and may only close over identifiers with that prefix.
- `jest.mock('@infrastructure/adapters/mailer', ...)`: keeps the real module but replaces `enqueueEmail` with a mock that pushes into `mockOutbox` and resolves.
- `setupTestDb()`: sets up the test database; `beforeEach` clears `mockOutbox`.
- `mailsOf(template)`: filters the outbox by template name.
- `BREACHED` (`'Password1!'`): a password on the bundled breach list that is otherwise within length bounds, so only the breach list can refuse it.
- Test cases:
  - **Success:** one `account.password-changed` mail goes to the user's email. Its `data.advice` contains "Forgot password", and the data contains no `linkUrl`.
  - **Refusals (`it.each`):** a wrong current password, a mistyped confirmation, or a breached new password each return `success: false` and send no `account.password-changed` mail.
  - **Reset:** `completePasswordReset` sends no `account.password-changed` mail but exactly one `account.reset-confirm` mail.

## Relationships
- `@modules/account/services` (`accountService`): calls `passwordChangeWithCurrent` and `completePasswordReset`.
- `@modules/users/tests/factories`: supplies `createUser`, `PASSPHRASE_PASSWORD` and `REPLACEMENT_PASSWORD`.
- `../factories` (account test factories): `plantToken` seeds a `'password'` reset token (`'reset-link'`, 1 hour TTL) for the reset test.
- `@tests/callers`: provides `testCallerContext`, passed to the service calls.
- `@tests/setup-test-db`: provides `setupTestDb`.
- `@infrastructure/adapters/mailer`: the mocked `enqueueEmail` that replaces real mail queuing.

## Notes
- Mail assertions are on queued mails (via the mocked `enqueueEmail`), not on delivery.
- The success test asserts the notice has advice but no link, so it does not look like a reset or phishing link.
