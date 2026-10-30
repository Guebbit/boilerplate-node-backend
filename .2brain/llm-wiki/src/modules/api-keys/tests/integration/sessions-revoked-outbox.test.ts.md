---
source: src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts
sha256: 2226aa423247c42a79ffc787d46b158a3cb07471c2725ebcd383005c4c0b7c55
generated_at: 2026-10-29T03:16:58.534253+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts

## Purpose

Integration test that proves the `account.sessions-revoked` outbox event is committed atomically with the credential write and epoch bump, that a failing `api-keys` consumer is retried by the relay (not silently dropped), and that the consumer is idempotent on redelivery. Both the password-reset and logout-everywhere HTTP paths are exercised.

## Key elements

- **`adminWithKey()`** – Creates a verified admin user, mints a live API key via `mint()`, logs in over HTTP, and returns `{ user, bearer, secret }` for subsequent assertions.
- **`resetWith(token)`** – POSTs to `/account/password/reset/confirm` to spend a planted reset token.
- **`makeDue()`** – Sets `nextAttemptAt` to epoch on all outbox rows so `relayOutbox()` processes them immediately (bypasses backoff).
- **`pendingRows()`** – Queries `outboxEventModel` for pending `account.sessions-revoked` rows.
- **`compromiseAudits()`** – Filters the mocked `emitAuditEvent` calls for `system.api_keys.revoked_on_compromise`.
- **Test: "a throwing api-keys consumer leaves the row pending…"** – Spies `revokeMany` to reject once; asserts the row stays pending, then after `makeDue()` + `relayOutbox()` the key is revoked.
- **Test: "logout everywhere takes the same road"** – Same failure/retry pattern via `DELETE /account/sessions`.
- **Test: "a rollback leaves no row and no new password"** – Mocks `outboxEventModel.create` to reject; asserts HTTP ≥ 400, no outbox row, and the original password still works.
- **Test: "a redelivery revokes nothing twice"** – Lets the first delivery succeed, manually resets the row to `pending`, runs the relay again; asserts the audit count stays at 1 (idempotent consumer).

## Relationships

- **`@kernel/outbox`** – Provides `outboxEventModel`, `relayOutbox`, and `settleOutboxNudges`; the tests directly manipulate model state and drive relay passes.
- **`@modules/api-keys/repository`** – `revokeMany` is spied on to simulate a consumer failure.
- **`@modules/api-keys/services/api-keys`** – `mint` creates the live credential that must later be revoked.
- **`@modules/api-keys/module`** – `onRegistered()` is called to install the credential resolver, mirroring real boot.
- **`@modules/users/tests/factories`** – `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for user and password lifecycle.
- **`@modules/account/tests/factories`** – `plantToken` seeds the password-reset token in the DB.
- **`@infrastructure/observability/audit`** – Fully mocked (not spied) to capture `emitAuditEvent` calls for idempotency assertions.
- **`@tests/http`** – Supertest-based client (`api()`) for driving login, reset, and session endpoints.
- **`@tests/credentials`** – `credentialOf` checks whether a key secret still resolves.
- **`@tests/setup-test-db` / `@tests/environment`** – Database lifecycle and env config per test.
- **`@kernel/access/tenant` / `@kernel/permissions`** – `DEPLOYMENT_TENANT_ID` and `permissionsOfRole('admin')` build the `TenantCallerContext` for `mint`.

## Notes

- The audit mock uses `jest.mock` + `jest.requireActual('@tests/ports')` rather than a plain `jest.spyOn`, because `recordAudit` closes over its own module-scoped `emitAuditEvent` reference — a spy on the imported binding would not intercept the internal call.
- `makeDue()` is required before calling `relayOutbox()`; without it the relay respects `nextAttemptAt` backoff and the test would time out or observe zero published events.
- The redelivery test resets `status` to `'pending'` directly on the model to simulate at-least-once delivery; it does not re-trigger the HTTP endpoint.
