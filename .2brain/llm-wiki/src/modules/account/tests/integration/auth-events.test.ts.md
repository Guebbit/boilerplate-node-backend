---
source: src/modules/account/tests/integration/auth-events.test.ts
source_sha256: d15f941834c8e5596e081c4f0677e04e731c48517c6351a1e5da196739cc8f39
context_sha256: 698d445fe0fc0f6d03460662719e000028bfec9ad357f74495c399449c871ba4
generated_at: 2026-11-22T03:52:16.799843+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/auth-events.test.ts

## Purpose
Integration tests that pin down what the account module writes to the audit trail when a one-time link token is refused and when a login fails. Rejected tokens are audited under `auth.*` (not `security.*`, since a stale customer link is the usual cause), and failed-login targets are recorded as a normalised keyed digest rather than the raw email.

## Key elements
- `setupTestDb()` – called at module level to prepare the test database.
- `Entry` – interface describing an audit entry as the logger receives it (`action`, optional `targetId`, optional `metadata`).
- `auditSpy` – `jest.spyOn(auditLogger, 'log')` with a no-op implementation, installed in `beforeEach` and restored in `afterEach`, which also restores real timers.
- `entries()` – reads the third argument of every `auditLogger.log` call as an `Entry`.
- `rejectedFlows()` – returns the `metadata.flow` of every `AUTH_ONE_TIME_TOKEN_REJECTED` entry.
- **"an unknown one-time token" suite**
  - A parametrised case posts a never-issued token to each of five endpoints: `password_reset`, `email_verify`, `email_change`, `email_change_undo` and `account_restore`. It expects a 422, exactly one audit entry carrying that flow, and the `authOneTimeTokenRejectedTotal` counter at 1 with label `{ flow }`.
  - An expired reset token (planted via `plantToken` with a 60s TTL, then the clock advanced by an hour) is audited as `password_reset`.
  - A mismatched password pair on the reset endpoint records no rejected-token entry.
- **"a failed login" suite**
  - `'  Victim@Example.COM '` is audited with `targetId === pseudonymise('log', 'victim@example.com')`, and the raw address never appears in any entry.
  - A non-string email (`{ $ne: '' }`) is still audited, with `targetId` undefined.
  - Correct credentials plus an unknown body field (`role`) give a 422, and the failure is still audited with the digest target.

## Relationships
- `@infrastructure/adapters/logger` – supplies `auditLogger`, whose `log` method is spied on.
- `@infrastructure/security/pseudonymise` – `pseudonymise('log', …)` computes the expected digest.
- `@modules/account/audit` – `accountAuditActions` provides the action names matched (`AUTH_ONE_TIME_TOKEN_REJECTED`, `AUTH_LOGIN`).
- `@modules/account/metrics` – `authOneTimeTokenRejectedTotal` counter, reset and read in the parametrised test.
- `../factories` (account) – `plantToken` seeds a password-reset token for the expiry case.
- `@modules/users/tests/factories` – `createUser` and `PLAIN_PASSWORD`.
- `@tests/clock` – `freezeDate` and `advanceDate` drive token expiry.
- `@tests/http` – `api()` is the HTTP client used to hit the routes.
- `@tests/setup-test-db` – `setupTestDb` provides the database lifecycle.

## Notes
- The reset-confirm request body includes the password fields only for `password_reset`, because the other contracts are strict and accept only `token`.
- In the unknown-field login test, the failure is audited before the stray key causes the 422, even though the credentials are valid.
- `authOneTimeTokenRejectedTotal.reset()` is called at the start of the parametrised case so counter values do not leak between cases.
