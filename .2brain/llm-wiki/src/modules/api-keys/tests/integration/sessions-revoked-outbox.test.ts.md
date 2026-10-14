---
source: src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts
sha256: 763ba2998105b130e6b7d3c25f56c6517d256f065bf651ea457955399eaf1e91
generated_at: 2026-10-14T15:04:21.302566+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts

## Purpose

Integration test proving that the `account.sessions-revoked` event is committed transactionally alongside the credential write and then delivered to the `api-keys` consumer via the outbox relay. It verifies at-least-once semantics: a failing consumer leaves the row pending, the relay retries, and a redelivery does not double-revoke. Driven over HTTP (login, reset-confirm, logout-all) to mirror real production traffic.

## Key elements

- **`adminWithKey()`** — Creates a verified admin user, mints an API key via `mint` from `api-keys` service, obtains a login bearer token, and returns all three.
- **`resetWith(token)`** — POSTs to `/account/reset-confirm` with a replacement password, simulating the mailed reset page.
- **`makeDue()`** — Sets `nextAttemptAt` on all outbox rows to epoch 0 so the next relay pass executes immediately (bypasses backoff).
- **`pendingRows()`** — Queries `outboxEventModel` for `account.sessions-revoked` rows still in `pending` status.
- **Test: "a throwing api-keys consumer leaves the row pending…"** — Mocks `apiKeyRepository.revokeMany` to reject once; asserts the row stays pending after the first pass, then after `makeDue()` + `relayOutbox()` the key is revoked and the row is consumed.
- **Test: "logout everywhere takes the same road"** — Same failure/retry flow via `/account/logout-all` with a bearer token.
- **Test: "a rollback leaves no row and no new password"** — Mocks `outboxEventModel.create` to reject; asserts HTTP ≥ 400, zero outbox rows, and the original password still works.
- **Test: "a redelivery revokes nothing twice"** — After successful delivery, resets the row to `pending` and re-runs the relay; asserts `revokeMany` is not called a second time (idempotency).

## Relationships

- **`src/modules/api-keys/module.ts`** — Calls `apiKeysModule.onRegistered()` to install the credential resolver, as a real boot would.
- **`src/modules/api-keys/services/api-keys.ts`** — Uses `mint` to create a live API key in the `adminWithKey` helper.
- **`src/modules/api-keys/repository.ts`** — Spies on `apiKeyRepository.revokeMany` to simulate consumer failures and to assert idempotency.
- **`src/kernel/outbox.ts`** — Exercises `outboxEventModel`, `relayOutbox`, and `settleOutboxNudges` to drive the relay and inspect row state.
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID` for the `TenantCallerContext` passed to `mint`.
- **`src/kernel/permissions.ts`** — Supplies `permissionsOfRole('admin')` for the caller context.
- **`src/modules/account/tests/factories.ts`** — Uses `plantToken` to create a password-reset token in the DB.
- **`src/modules/users/tests/factories.ts`** — Uses `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for user setup and password flows.
- **`tests/support/http.ts`** — All HTTP requests go through the `api()` supertest helper.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises an isolated Mongo instance.
- **`tests/support/environment.ts`** — `setEnvironment` silences mail transport per test.
- **`tests/support/credentials.ts`** — `credentialOf` checks whether a key secret is still live.
- **`src/types/index.ts`** — Imports `TenantCallerContext` for the `mint` call context.

## Notes

- The test calls `apiKeysModule.onRegistered?.()` at module scope (not in a hook), mirroring real boot ordering; forgetting this would leave the credential resolver uninstalled.
- `makeDue()` is a manual backoff bypass — it rewrites `nextAttemptAt` to `Date(0)` so `relayOutbox()` runs immediately without waiting.
- The rollback test asserts the *original* password still logs in, confirming the credential write and outbox insert share one transaction (no partial commit).
- The redelivery test resets the row to `pending` *after* a successful delivery to simulate at-least-once redelivery; the expectation is that `revokeMany` is a no-op the second time (idempotent consumer).
