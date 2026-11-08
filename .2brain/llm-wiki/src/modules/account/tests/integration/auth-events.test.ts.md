---
source: src/modules/account/tests/integration/auth-events.test.ts
sha256: 15e46e35969bb94426d2c1527aa0686326ec426fd93b9eeb322b582cb2324e00
generated_at: 2026-11-08T04:33:52.611325+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-events.test.ts

## Purpose

Integration tests verifying the audit-log entries and Prometheus counters produced when a one-time token is rejected (unknown or expired) and when a login attempt fails. Confirms that token rejections are tagged with `auth.*` actions (not `security.*`), counted per flow, and that failed logins record only a pseudonymised email digest rather than the raw address.

## Key elements

- **`Entry`** — local interface describing the shape of one audit log entry (`action`, `targetId`, `metadata`) as passed to `auditLogger.log`.
- **`auditSpy`** — `jest.spyOn(auditLogger, 'log')` installed in `beforeEach`, restored in `afterEach`; all assertions read from this spy rather than a real store.
- **`entries()`** — helper that maps `auditSpy.mock.calls` into `Entry[]`.
- **`rejectedFlows()`** — filters entries to `AUTH_ONE_TIME_TOKEN_REJECTED` and returns the `metadata.flow` value(s).
- **`describe('an unknown one-time token')`** — parameterised over five flows (password_reset, email_verify, email_change, email_change_undo, account_restore); asserts 422 status, correct `flow` in audit, and a count of 1 on `authOneTimeTokenRejectedTotal`. Also covers an expired token (TTL exceeded via `advanceDate`) and a case where only the password pair is mismatched (no token-rejected entry emitted).
- **`describe('a failed login')`** — asserts `targetId` equals `pseudonymise('log', 'victim@example.com')` (trimmed + lowercased) and that the raw email string never appears in serialised entries; also confirms a non-string email yields `targetId: undefined`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/adapters/logger.ts` | Imports `auditLogger`; the test spies on its `.log` method to capture entries. |
| `src/infrastructure/security/pseudonymise.ts` | Imports `pseudonymise` to compute the expected `targetId` digest. |
| `src/modules/account/audit.ts` | Imports `accountAuditActions` constants used to filter entries and assert action names. |
| `src/modules/account/metrics.ts` | Imports `authOneTimeTokenRejectedTotal` counter; calls `.reset()` and `.get()` to assert label/value. |
| `src/modules/account/tests/factories.ts` | Imports `plantToken` to seed a token with a short TTL for the expiry test. |
| `src/modules/users/tests/factories.ts` | Imports `createUser` and `PLAIN_PASSWORD` for test fixtures. |
| `tests/support/clock.ts` | Imports `freezeDate` / `advanceDate` to simulate TTL expiry. |
| `tests/support/http.ts` | Imports `api` for issuing HTTP requests against the app. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` at module top-level to prepare the test database. |

## Notes

- `jest.useRealTimers()` in `afterEach` is required because `freezeDate`/`advanceDate` install fake timers; forgetting this leaks fake timers into subsequent suites.
- The "password pair mismatch" test asserts the **absence** of a token-rejected entry: a 422 caused by the password fields must not be conflated with a token rejection.
- The pseudonymisation test asserts the raw email is absent from `JSON.stringify(entries())`, guarding against accidental leakage in any metadata field, not just `targetId`.
- `pseudonymise` is called with key `'log'` and the **normalised** value (`'victim@example.com'`), i.e. trimming and lowercasing happen before the digest is computed.
