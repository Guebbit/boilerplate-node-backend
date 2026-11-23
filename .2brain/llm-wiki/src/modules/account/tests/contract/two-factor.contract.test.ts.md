---
source: src/modules/account/tests/contract/two-factor.contract.test.ts
source_sha256: dac108e18cb9487ac203a1c9c4fd97390f6813e89050697e14f31fcaf0700cb9
context_sha256: cb3b0d2f420248c173ea0bc65746343f1f0d28f80562549de6c039aedbdeee66
generated_at: 2026-11-22T03:51:46.067607+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/two-factor.contract.test.ts

## Purpose
Contract tests for the second-factor (2FA) endpoints: status read, disable, remove one method, regenerate backup codes, and mailing a login or setup code. Each test checks that the success or refusal response matches the shape `openapi.yaml` publishes. The underlying behaviour is tested in `src/modules/account/tests/integration/two-factor.test.ts`, not here.

## Key elements
- `mockOutbox`: array capturing `{ template, data }` for every queued email. `enqueueEmail` from `@infrastructure/adapters/mailer` is mocked to push into it, while the rest of the mailer module stays real.
- `Session` interface: `{ user, bearer }`, a signed-in account and its `Authorization` header value.
- `verifiedSession()`: creates a verified user (`ada@example.com`) and logs in via `loginBearer`. The email factor refuses unverified addresses.
- `carryOn(session)`: after a factor change revokes all sessions, mints a new session with `amr: ['pwd', 'otp']` via `mintSession` and replaces `session.bearer`.
- `armTotp(session)`: runs TOTP setup and confirm, stores the returned backup codes in `backupCodesOf`, calls `carryOn`, and returns the secret.
- `backupCodesOf`: `Map` from TOTP secret to its backup codes. A second factor can prove itself with one.
- `armEmail(session, proof?)`: runs email setup, reads the latest `account.two-factor-code` mail from `mockOutbox`, confirms with that code, then calls `carryOn`. `proof` is a code from an already-armed factor.
- `describe` blocks, one per endpoint:
  - `GET /account/2fa`: 200 and `methods` equals `['totp']`.
  - `POST /account/2fa/backup-codes`: 200 with a fresh set on a valid code; 422 on a wrong code.
  - `POST /account/2fa/methods/{method}/remove`: 200 when one of two factors is removed; 404 for an unknown method (`carrier-pigeon`).
  - `POST /account/2fa/disable`: 200, then status shows no methods. The old `DELETE /account/2fa` returns 405 and `DELETE /account/2fa/methods/totp` returns 404.
  - `POST /account/login/2fa/send`: 200 with `sentTo` `a***a@example.com` for a real login challenge; 401 for a forged challenge.
  - `POST /account/2fa/methods/{method}/send`: 200 with a masked `sentTo` for an armed method; 422 if not armed.
  - `POST /account/2fa/methods/{method}/setup` with a code: 422 when a second method is started without a proof code.

## Relationships
- `src/modules/account/tests/factories.ts`: provides `mintSession`, used by `carryOn`.
- `src/modules/users/tests/factories.ts`: provides `createUser` and `PLAIN_PASSWORD` for accounts and the login request.
- `tests/support/contract.ts`: imported for side effects as `@tests/contract`.
- `tests/support/environment.ts`: `setEnvironment` sets `NODE_MAIL_TRANSPORT: 'outbox'` before each test.
- `tests/support/http.ts`: `api()` for requests and `loginBearer` for bearer tokens.
- `tests/support/setup-test-db.ts`: `setupTestDb()` sets up the test database.
- `tests/support/totp.ts`: `codeFor(secret, offset)` generates TOTP codes.

## Notes
- The `outbox` mail transport is needed because the suite default `log` drops mail, and a mailed code is only offered where mail reaches a person (`mailDelivers`). `enqueueEmail` is mocked, so nothing is actually sent.
- `mockOutbox` is cleared in a second `beforeEach`.
- Arming or removing a factor revokes all sessions, so helpers call `carryOn` and the disable test calls it again before re-reading status.
- Codes are generated with offset `0` at confirm time and `1` for later operations, which suggests a different time step is used for each.
