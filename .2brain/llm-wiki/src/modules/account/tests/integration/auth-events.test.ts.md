---
source: src/modules/account/tests/integration/auth-events.test.ts
sha256: fec5b3b655f6b6b2015fe183201a9b20cb78197a111571ca5a9429d09eafa67c
generated_at: 2026-11-14T19:00:55.331720+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-events.test.ts

## Purpose

Integration tests that pin down exactly what lands in the audit trail and metrics when a one-time link token is refused (unknown or expired) and when a login attempt fails. The module doc-block clarifies the naming intent: these are `auth.*` events, not `security.*`, because a stale link or a mistyped password is the common customer scenario rather than an attack.

## Key elements

- **`Entry`** — local interface describing the shape the audit logger receives (`action`, optional `targetId`, optional `metadata`).
- **`auditSpy`** — `jest.spyOn(auditLogger, 'log')` installed in `beforeEach`; the single mechanism by which tests inspect emitted audit entries.
- **`entries()`** — helper that maps the spy's call history to `Entry[]`.
- **`rejectedFlows()`** — filters entries to `AUTH_ONE_TIME_TOKEN_REJECTED` and returns the `metadata.flow` values.
- **`describe('an unknown one-time token')`** — parameterised across five flows (password_reset, email_verify, email_change, email_change_undo, account_restore); asserts 422, correct audit action, and that `authOneTimeTokenRejectedTotal` increments by 1 for that flow label. Also covers: an expired token reads identically to an unknown one, and a password-mismatch rejection does *not* emit a token-rejected entry.
- **`describe('a failed login')`** — asserts the audit `targetId` is `pseudonymise('log', normalisedEmail)` (never the raw address), that a non-string email produces no `targetId`, and that a stray unknown field in the body still yields a 422 *and* an audit entry.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/audit.ts` | Imports `accountAuditActions` enum; tests match on `AUTH_ONE_TIME_TOKEN_REJECTED` and `AUTH_LOGIN`. |
| `src/modules/account/metrics.ts` | Imports `authOneTimeTokenRejectedTotal`; resets it before each sub-test and asserts the label/value after. |
| `src/infrastructure/adapters/logger.ts` | Imports `auditLogger`; the entire audit assertion path goes through a spy on its `log` method. |
| `src/infrastructure/security/pseudonymise.ts` | Imports `pseudonymise` to compute the *expected* `targetId` digest for login entries. |
| `src/modules/account/tests/factories.ts` | Imports `plantToken` to seed a short-TTL token for the expiry scenario. |
| `src/modules/users/tests/factories.ts` | Imports `createUser` and `PLAIN_PASSWORD` for user setup and request bodies. |
| `tests/support/http.ts` | Imports `api()` to issue real HTTP requests against the running app. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` once at module level to provision the database. |
| `tests/support/clock.ts` | Imports `freezeDate` / `advanceDate` to make a token expire deterministically. |

## Notes

- The password-mismatch test ("is not recorded when the password pair is what was refused") guards a subtle boundary: a 422 caused by `password !== passwordConfirm` must **not** emit `AUTH_ONE_TIME_TOKEN_REJECTED`. Only a genuinely bad/missing token does.
- The expired-token test plants a 60 s TTL and then advances the clock 1 hour; the assertion is identical to the "never-issued" case, confirming the codebase treats expiry and unknown as the same audit event.
- `pseudonymise('log', …)` is the expected digest key; the second argument `'log'` is a domain-salt distinct from other call-sites. The test also asserts the raw email never appears anywhere in the serialised entry list.
- The "stray field" login test sends a *valid* email + password plus an extra `role: 'admin'` key; the 422 comes from contract validation *after* the credential check, and the test asserts the audit entry is still present — i.e., validation rejection does not suppress the failure record.
- `jest.useRealTimers()` in `afterEach` is the cleanup counterpart to the clock helpers; forgetting it would leak fake timers into sibling suites.
