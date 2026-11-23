---
source: src/modules/account/tests/integration/urgent-mail.test.ts
source_sha256: e278bbfaedc6708198400a3332b7d7dcb03fe2297e023c0e9194ec0b95673089
context_sha256: b2344a2661d616cb4f66a0207eb35148e547b2e4d7f81813ab94196cdd22d40d
generated_at: 2026-11-22T04:03:21.453896+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/urgent-mail.test.ts

## Purpose
Integration test that pins down which account mails are queued on the urgent mail queue and which stay on the ordinary one. Five mails are urgent because a person is waiting on a screen for them: the verification link, the password-reset link, a two-factor code, the export-ready link (covered in `export.test.ts`) and the account-deletion link. Other mails, such as the undo notice and the restore confirmation, must stay on the ordinary queue.

## Key elements
- `mockOutbox`: an array that records every queued mail as `{ to, template, data, urgent }`.
- `jest.mock('@infrastructure/adapters/mailer', ...)`: keeps the real module but replaces `enqueueEmail` with a mock. The mock pushes into `mockOutbox` and sets `urgent` to `options?.urgent === true`.
- `setupTestDb()`: sets up the test database.
- `beforeEach`: sets `NODE_MAIL_TRANSPORT` to `outbox` and clears `mockOutbox`.
- `urgentOf(template)`: returns the `urgent` flag of the first mail queued with that template, or `undefined` if none was queued.
- Describe block "the mails a person is waiting on go to the urgent queue". Each test expects `urgent === true`:
  - the email-change verification link, `account.verify-request`
  - the password-reset link, `account.reset-request`
  - a two-factor code, `account.two-factor-code`
  - the account-deletion link, `account.deletion-scheduled`
- Describe block "the mails nobody is waiting on stay on the ordinary queue". Each test expects `urgent === false`:
  - the undo notice sent to the old address of an email change, `account.email-change-notice`
  - the restore confirmation, `account.restored`

## Relationships
- `@tests/http` (`tests/support/http.ts`): provides `api()` for HTTP requests and `loginBearer()` for authorization headers.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): provides `setupTestDb`.
- `@tests/environment` (`tests/support/environment.ts`): provides `setEnvironment`, used to set the mail transport.
- `@tests/eventually` (`tests/support/eventually.ts`): provides `eventually`, which the password-reset test uses to wait until the mail appears.
- `src/modules/users/tests/factories.ts`: provides `createUser`, `PLAIN_PASSWORD` and `userRepository`. `userRepository` is used to create a password-less account for the two-factor test.
- `src/modules/users/repository.ts`: the repository behind `userRepository`. It is reached through the users test factories rather than imported directly.
- `src/modules/account/tests/factories.ts`: provides `mintSession`, which creates a bearer session with `amr: ['google']` for the two-factor test.

## Notes
- The two-factor test uses an account with no password, as in `code-delivery.contract.test.ts`, so arming the method needs no step-up.
- The restore test first deletes the account, then reads the token from the hash fragment of the `linkUrl` in the `account.deletion-scheduled` mail. It clears `mockOutbox` before posting to `/account/restore`, so only the restore mail is checked.
- Only the password-reset test uses `eventually`. The other tests assert right after the request returns.
