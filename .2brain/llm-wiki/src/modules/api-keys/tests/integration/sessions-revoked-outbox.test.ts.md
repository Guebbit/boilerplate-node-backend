---
source: src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts
sha256: 38379fe69e21ee864d588bf0afb6f6104a8c11cf3873716cfc462af95855e3ed
generated_at: 2026-11-14T19:23:31.373741+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts

## Purpose

Integration test verifying that the `account.sessions_revoked` outbox event is committed atomically with the credential write (password reset / logout-everywhere) and that a failing `api-keys` consumer is retried by the relay rather than silently lost. All flows are driven over HTTP to mirror how real resets and logouts arrive.

## Key elements

- **`adminWithKey`** – Creates a verified admin user, mints one live API key via `mint()`, and returns the user, a login bearer token, and the key secret for later assertions.
- **`resetWith(token)`** – POSTs to `/account/password/reset/confirm` to spend a planted reset link, exactly as the mailed page would.
- **`makeDue()`** – Sets `nextAttemptAt` on every outbox row to epoch 0 so the next relay pass fires immediately without waiting out backoff.
- **`pendingRows()`** – Returns all outbox rows named `account.sessions_revoked` with status `pending`.
- **`compromiseAudits()`** – Filters `emitAuditEvent` mock calls for `system.api_keys.revoked_on_compromise` events; used to assert exactly-once revocation semantics.
- **`apiKeysModule.onRegistered?.()`** – Installs the credential resolver at module level, replicating what a real boot does once the module is enabled.
- **Four test cases** inside `describe('account.sessions_revoked through the outbox')`:
  - Throwing `revokeMany` → row stays pending → relay retry revokes the key.
  - `DELETE /account/sessions` (logout-everywhere) takes the same outbox road.
  - Outbox `create` failure → transaction rolls back → no row, old password still valid.
  - At-least-once redelivery → second delivery is a no-op (key already revoked, audit count unchanged).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/outbox.ts` | Imports `outboxEventModel`, `relayOutbox`, `settleOutboxNudges` to query, force-deliver, and flush outbox rows. |
| `src/modules/api-keys/repository.ts` | Imports `apiKeyRepository` and spies on its `revokeMany` method to simulate a transient consumer failure. |
| `src/modules/api-keys/services/api-keys.ts` | Calls `mint` to create the live credential under test. |
| `src/modules/api-keys/module.ts` | Calls `onRegistered()` to wire the credential resolver. |
| `src/infrastructure/observability/audit.ts` | Mocked via a jest module factory so `emitAuditEvent` becomes a jest mock for call-count assertions. |
| `src/kernel/access/tenant.ts` | Imports `DEPLOYMENT_TENANT_ID` for the caller context. |
| `src/kernel/permissions.ts` | Imports `permissionsOfRole('admin')` for the caller context. |
| `src/types/auth-context.ts` (via `@types`) | Imports `TenantCallerContext` type. |
| `src/modules/users/tests/factories.ts` | Imports `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`. |
| `src/modules/account/tests/factories.ts` | Imports `plantToken` to seed a password-reset token. |
| `tests/support/credentials.ts` | Imports `credentialOf` to assert whether a key secret is still live. |
| `tests/support/http.ts` | Imports `api` for all HTTP-driven requests. |
| `tests/support/environment.ts` | Imports `setEnvironment` to set `NODE_MAIL_TRANSPORT`. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` for database isolation. |

## Notes

- The audit module is **replaced, not spied on**: `recordAudit` in production closes over its own module's `emitAuditEvent`, so a simple `jest.spyOn` on the imported binding would not intercept it. The module factory swaps in a shared port mock.
- Tests are **HTTP-driven by design** — they exercise the full request → service → outbox-commit path rather than calling services directly, ensuring the transactional guarantee is what's under test.
- `settleOutboxNudges()` must be awaited **after** the HTTP response; it flushes any outbox writes that were nudged synchronously within the request but not yet relayed.
- The redelivery test manually flips the outbox row back to `pending` to simulate at-least-once semantics; no production code path performs this, so it is an explicit test-only action.
- `makeDue()` is a test-only helper to bypass exponential backoff; in production the relay waits on `nextAttemptAt`.
