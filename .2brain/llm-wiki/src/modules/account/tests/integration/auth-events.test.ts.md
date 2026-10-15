---
source: src/modules/account/tests/integration/auth-events.test.ts
sha256: 19cd22af1ad7af4e8d4411e301dcbf2f2541923a03a5ac242d3c24442a55bd78
generated_at: 2026-10-15T10:10:09.326733+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-events.test.ts

## Purpose

Integration tests that assert what the audit trail and metrics record when a one-time link token is rejected (unknown or expired) and when a login attempt fails. Confirms the events use `auth.*` actions (customer-facing, not `security.*`), that the rejected-token counter is incremented per flow, and that a failed-login target is stored as a normalised pseudonymised digest rather than the raw address.

## Key elements

- **`Entry` interface** — the shape of a single audit log call as `auditLogger.log` receives it (`action`, `targetId`, `metadata`).
- **`entries()`** — helper that maps `auditSpy.mock.calls` into `Entry[]`.
- **`rejectedFlows()`** — filters entries to `AUTH_ONE_TIME_TOKEN_REJECTED` and extracts `metadata.flow`.
- **`describe('an unknown one-time token')`** — `it.each` across 5 flows (`password_reset`, `email_verify`, `email_change`, `email_change_undo`, `account_delete`); asserts 422, the correct `flow` label in the audit entry, and that `authOneTimeTokenRejectedTotal` carries `{ flow }` = 1.
- **Expired-token test** — plants a 60 s token, advances the clock 1 h, expects the same `password_reset` rejection path.
- **Password-mismatch test** — valid token, mismatched password pair → *no* `AUTH_ONE_TIME_TOKEN_REJECTED` entry (it's a different failure).
- **`describe('a failed login')`** — verifies `targetId` equals `pseudonymise('log', 'victim@example.com')` (normalised, lower-cased) and that the raw email string never appears anywhere in the serialised entries. Also covers a non-string email (`{ $ne: '' }`) yielding `targetId: undefined`.

## Relationships

- **`@tests/http`** (`api`) — issues the actual HTTP requests against the account routes.
- **`@tests/setup-test-db`** (`setupTestDb`) — initialises the test database (called at module top-level).
- **`@tests/clock`** (`freezeDate`, `advanceDate`) — controls time in the expired-token test.
- **`@infrastructure/adapters/logger`** (`auditLogger`) — spied on in `beforeEach`; all assertions read from its mock calls.
- **`@infrastructure/security/pseudonymise`** (`pseudonymise`) — used to compute the expected digest for the failed-login target assertion.
- **`@modules/users/tests/factories`** (`createUser`, `PLAIN_PASSWORD`) — creates a real user and supplies the password constant.
- **`@modules/account/audit`** (`accountAuditActions`) — provides the action-name constants the tests filter on.
- **`@modules/account/metrics`** (`authOneTimeTokenRejectedTotal`) — the counter under test; reset before each flow case.
- **`../factories`** (`plantToken`) — inserts a token row directly into the DB for the expiry scenario.

## Notes

- The spy is on `auditLogger.log`'s **third positional argument** (the `Entry` object); the first two are assumed to be logger context. Changing the logger's call signature will silently break every assertion.
- `authOneTimeTokenRejectedTotal.reset()` is called inside the `it.each` body, so the metric is isolated per case but **not** reset for the expired-token or password-mismatch tests (they rely on the `rejectedFlows()` helper instead of the metric).
- The password-mismatch test expects *zero* rejected-token entries — the refusal is categorised differently (password validation, not token rejection) and is intentionally excluded here.
- `jest.useRealTimers()` in `afterEach` guards against the frozen clock leaking into sibling tests.
