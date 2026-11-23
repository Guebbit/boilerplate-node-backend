---
source: src/modules/account/tests/contract/code-delivery.contract.test.ts
source_sha256: 595668b021d0e18ea7a5c3840e960f945840ed4f35a9cdd20e92cbaea620026c
context_sha256: e59f20a9da1318ed2c5c9be9b36611615a9be1e03055692ce19182b4e7b4f2b7
generated_at: 2026-11-22T03:50:00.787817+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/code-delivery.contract.test.ts

## Purpose
Contract tests for the mailed-code endpoints, exercising two deployment facts that other suites hide. Other suites force the `outbox` mail transport. This one covers a deployment whose mail reaches no person (the `log` transport). It also covers the single hourly send budget that the 2FA email send and the step-up (reauth) email send share.

## Key elements
- `mockOutbox`: an array of `{ template, data }` that collects every queued mail, newest last, so tests can read the code the recipient would see.
- `jest.mock('@infrastructure/adapters/mailer')`: keeps the real module but replaces `enqueueEmail` with a mock that pushes to `mockOutbox` and resolves.
- `setupTestDb()` and a `beforeEach` that clears `mockOutbox`.
- Describe `a deployment whose mail reaches no person` (`NODE_MAIL_TRANSPORT: 'log'`):
  - The email 2FA setup route (`POST /account/2fa/methods/email/setup`) returns 404. Its status and body, after `withoutInstance`, match those of an unknown method (`/methods/nonsense/setup`).
  - An OAuth-only user (no password, `amr: ['google']`) gets `{ methods: [] }` from `GET /account/reauth`. `POST /account/reauth/methods/email/send` returns 422.
- Describe `the send budget shared by 2FA and step-up` (`NODE_MAIL_TRANSPORT: 'outbox'`):
  - Sets `NODE_MFA_ACCOUNT_SEND_MAX` to `'2'` through `withEnvironmentOverrides`.
  - Arms the email factor through setup and confirm. The confirm code is read from the `account.two-factor-code` mail in `mockOutbox`.
  - Then sends once to the 2FA route, once to the reauth route and once more to the reauth route. The statuses must be `[200, 200, 429]`.

## Relationships
- `@tests/contract`: imported for its side effects, as the contract suite setup.
- `@tests/setup-test-db` (`setupTestDb`): provides the test database.
- `@tests/environment` (`setEnvironment`, `withEnvironmentOverrides`): switch the mail transport and the send limit.
- `@tests/http` (`api`, `loginBearer`): make the HTTP requests and obtain a bearer token for a user.
- `@tests/problem` (`withoutInstance`): strips the instance field from problem bodies so the two 404 responses can be compared.
- `@modules/users/tests/factories` (`createUser`, `userRepository`): create the users. `userRepository` comes from `src/modules/users/repository.ts` and is used to create the password-less user directly.
- `../factories` (`mintSession`): mints sessions with chosen `amr` values.

## Notes
- The two OAuth-only users in this file use the same username and email; each lives in a separate test.
- The comment in the budget test says arming (setup and confirm) does not spend the send budget. Only the two send routes do.
- The second session is minted with `amr: ['google', 'otp']`, after the email factor is armed.
