---
source: src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts
sha256: a62d618fafea92f2149121c10a6fbfa62b2a405c14daee9683ceb63a7186dc40
generated_at: 2026-11-08T05:06:40.053549+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts

## Purpose

Integration test verifying that the `account.sessions_revoked` outbox event is committed atomically with the credential write and epoch bump during password-reset and logout-everywhere flows, and that a failing `api-keys` consumer is retried by the relay rather than silently dropped. All scenarios are driven over HTTP to mirror how real requests arrive.

## Key elements

- **`compromiseAudits()`** — Filters the mocked `emitAuditEvent` calls for `system.api_keys.revoked_on_compromise`, used to assert audit-side effects.
- **`adminWithKey()`** — Creates a verified admin user, mints one live API key via `mint()`, logs in over HTTP, and returns `{ user, bearer, secret }`.
- **`resetWith(token)`** — POSTs to `/account/password/reset/confirm` with a replacement password, simulating the mailed reset link.
- **`makeDue()`** — Bulk-sets every outbox row's `nextAttemptAt` to epoch 0 so `relayOutbox()` processes them immediately without backoff.
- **`pendingRows()`** — Queries `outboxEventModel` for pending `account.sessions_revoked` rows.
- **`describe` block (4 tests)** —
  - *Throwing consumer → pending row → relay retry revokes keys*: mocks `apiKeyRepository.revokeMany` to reject once; asserts the row stays pending, then relay publishes it and the credential is gone.
  - *Logout everywhere*: same outbox path via `DELETE /account/sessions`.
  - *Rollback*: mocks `outboxEventModel.create` to reject; asserts no outbox row exists and the old password still works.
  - *Redelivery idempotency*: resets a published row back to `pending`, re-runs relay, asserts no duplicate revocation or second audit event.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | `api()` provides the HTTP client for all endpoint calls. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory Mongo instance. |
| `tests/support/environment.ts` | `setEnvironment` sets `NODE_MAIL_TRANSPORT` to `'log'` per test. |
| `tests/support/credentials.ts` | `credentialOf(secret)` looks up whether an API key is still live in the DB. |
| `src/modules/api-keys/module.ts` | `apiKeysModule.onRegistered()` installs the credential resolver as a real boot would. |
| `src/modules/api-keys/services/api-keys.ts` | `mint()` creates the test API key. |
| `src/modules/api-keys/repository.ts` | `apiKeyRepository.revokeMany` is spied to simulate consumer failure. |
| `src/kernel/outbox.ts` | `outboxEventModel`, `relayOutbox`, `settleOutboxNudges` drive the outbox lifecycle under test. |
| `src/kernel/access/tenant.ts` | `DEPLOYMENT_TENANT_ID` populates the caller context. |
| `src/kernel/permissions.ts` | `permissionsOfRole('admin')` builds the caller's permission set. |
| `src/modules/users/tests/factories.ts` | `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` seed the user and passwords. |
| `src/modules/account/tests/factories.ts` | `plantToken` creates the reset-link token in the DB. |
| `src/infrastructure/observability/audit.ts` | `emitAuditEvent` is mocked to capture audit assertions. |
| `src/types/index.ts` | `TenantCallerContext` type for the `mint()` caller context. |

## Notes

- The audit module is **replaced, not spied on** (`jest.mock` + `jest.requireActual` on `@tests/ports`), because `recordAudit` closes over its own module-scope reference to `emitAuditEvent`; a plain `jest.spyOn` on the re-export would not intercept the internal call.
- `makeDue()` is required before calling `relayOutbox()` in retry tests; without it the relay would honour the backoff window and skip the row.
- The idempotency test simulates at-least-once delivery by manually flipping a `published` row back to `pending`—the relay itself does not re-deliver, so this step is test-specific.
- All four tests call `settleOutboxNudges()` after the HTTP request to flush the in-transaction outbox write before asserting on DB state.
