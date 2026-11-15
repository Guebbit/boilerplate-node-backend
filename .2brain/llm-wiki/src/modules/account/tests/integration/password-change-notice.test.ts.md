---
source: src/modules/account/tests/integration/password-change-notice.test.ts
sha256: 48f347237eae54ddb7c34b012ec8ce8e095494700204d571455dcafe26badbda
generated_at: 2026-11-14T19:06:28.287484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/password-change-notice.test.ts

## Purpose

Integration test verifying the out-of-band email sent to the account holder after a successful signed-in password change. It asserts the mail is delivered exactly once, addressed correctly, carries the `account.password-changed` template with advice text and no reset link, and is never sent for a refused change or a password reset (which uses its own `account.reset-confirm` template).

## Key elements

- **`mockOutbox`** — Array that captures every email the app queues during a test. Named `mock*` because `jest.mock`'s factory is hoisted above imports and may only close over identifiers with that prefix.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — Replaces `enqueueEmail` with a spy that pushes `{to, template, data}` into `mockOutbox` and resolves immediately. All other exports of the mailer are preserved via `requireActual`.
- **`mailsOf(template)`** — Small filter helper returning only the queued mails matching a given template string.
- **`BREACHED`** (`'Password1!'`) — A password that is on the known-breach list yet strong enough to satisfy composition rules, isolating the breach check as the sole failure reason.
- **`describe('the notice after a signed-in password change')`** — Three test groups:
  - *success*: calls `accountService.passwordChangeWithCurrent`; asserts one mail, correct recipient, advice string present, and no `linkUrl` anywhere in the payload.
  - *refused change* (`it.each`): wrong current password, mistyped confirmation, breached new password — asserts `outcome.success === false` and zero mails of the change template.
  - *reset distinction*: plants a reset token via `plantToken`, calls `accountService.completePasswordReset`; asserts zero change-template mails and exactly one `account.reset-confirm` mail.

## Relationships

- **`src/modules/account/services/index.ts`** — The system under test. This file imports `accountService` from this module and drives it (password-change and password-reset flows) to exercise the notice behavior.
- **`src/modules/account/tests/factories.ts`** — Provides `plantToken`, used to seed a password-reset token for the reset-distinction test.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser`, `PASSPHRASE_PASSWORD`, and `REPLACEMENT_PASSWORD` for user fixture setup and known credentials.
- **`tests/support/callers.ts`** — Provides `testCallerContext`, the caller identity passed to every service call.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb`, invoked at module scope to create and tear down a fresh database for each test file.

## Notes

- **`mockOutbox` naming is not stylistic** — it is a hard requirement of Jest's hoisting rule: identifiers referenced inside a `jest.mock` factory must begin with `mock` (or `Mock`) unless declared with `var`/`global`. Renaming will break the test at runtime with a `ReferenceError`.
- The success test asserts the absence of `linkUrl` by serialising the entire `data` object to JSON and checking the string — this catches the key at any nesting depth without coupling to the exact shape of `data`.
- The `it.each` table deliberately picks three *distinct* refusal reasons (auth failure, confirmation mismatch, breach) so that a regression in any one guard is caught independently.
