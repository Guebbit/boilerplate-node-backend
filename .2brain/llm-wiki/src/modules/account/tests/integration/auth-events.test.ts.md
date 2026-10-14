---
source: src/modules/account/tests/integration/auth-events.test.ts
sha256: cf8d3226d75442ebf47d42833a45a954c3631a53e0264b3a71976f84befc5d2d
generated_at: 2026-10-14T09:07:09.774468+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-events.test.ts

## Purpose
Integration tests that verify the audit-trail entries and Prometheus counter produced when a one-time token is rejected (unknown or expired) and when a login attempt fails. They confirm that audit actions use the `auth.*` namespace (not `security.*`) and that the login-failure target is a normalised keyed pseudonym digest rather than the raw address.

## Key elements
- **`Entry`** – local interface describing the shape the audit logger receives (`action`, `targetId`, `metadata`).
- **`auditSpy`** – `jest.spyOn(auditLogger, 'log')` captured in `beforeEach`, restored in `afterEach`.
- **`entries()`** – helper that returns all captured `Entry` objects from the spy.
- **`rejectedFlows()`** – filters entries to `AUTH_ONE_TIME_TOKEN_REJECTED` and extracts `metadata.flow`.
- **`describe('an unknown one-time token')`** – four `it.each` cases (password_reset, email_verify, email_change, account_delete) asserting a 422 response, the correct audit flow label, and an incremented `authOneTimeTokenRejectedTotal` counter. Also covers an *expired* token (via `plantToken` + `advanceDate`) and a *password-mismatch* case that must **not** produce a rejected-token entry.
- **`describe('a failed login')`** – asserts `targetId` equals `pseudonymise('log', 'victim@example.com')`, that the raw email never appears in serialised entries, and that a non-string email yields no `targetId`.

## Relationships
- **`@tests/http` → `api`** – provides the supertest-style HTTP client used to hit the real account routes.
- **`@tests/setup-test-db` → `setupTestDb`** – initialises a test database for the module (called once at top level).
- **`@tests/clock` → `freezeDate`, `advanceDate`** – control time so an expired-token scenario can be exercised deterministically.
- **`@infrastructure/adapters/logger` → `auditLogger`** – the spy target; tests read calls from this logger rather than querying a DB table.
- **`@infrastructure/security/pseudonymise` → `pseudonymise`** – used to compute the *expected* digest value for assertions.
- **`@modules/account/audit` → `accountAuditActions`** – supplies the canonical action-string constants (`AUTH_ONE_TIME_TOKEN_REJECTED`, `AUTH_LOGIN`).
- **`@modules/account/metrics` → `authOneTimeTokenRejectedTotal`** – the counter under test; `.reset()` is called before each flow assertion.
- **`../factories` (account test factories) → `plantToken`** – seeds a token with a short TTL so the expiry path can be triggered.
- **`@modules/users/tests/factories` → `createUser`, `PLAIN_PASSWORD`** – creates a real user and provides the canonical password string for contract bodies.

## Notes
- The spy is on `auditLogger.log`; no audit rows are written to (or read from) the test database. Restore + `jest.useRealTimers()` runs in `afterEach`.
- The password-mismatch test (valid token, mismatched confirm password) intentionally expects **zero** rejected-token entries—this distinguishes "token rejected" from "credentials rejected" in the audit log.
- The failed-login test sends a non-string email (`{$ne: ''}`) to exercise the branch where `targetId` is left `undefined` rather than crashing.
- `authOneTimeTokenRejectedTotal` is a Prometheus counter; the test calls `.reset()` per case and reads `.get().values` to assert a single increment with the correct `flow` label.
