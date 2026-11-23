---
source: src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts
generated_at: 2026-11-22T04:25:30.423008+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts

## Purpose
Integration test verifying that the `account.sessions_revoked` event is delivered through the transactional outbox. It checks that the event commits atomically with the credential write, and that a failing `api-keys` consumer is retried by the relay rather than dropped. Scenarios are driven over HTTP: a password reset confirm and a "logout everywhere" call.

## Key elements
- `jest.mock('@infrastructure/observability/audit', ...)`: replaces the audit port with `auditPortMock()` from `@tests/ports`. A spy would not work, because `recordAudit` closes over its own module's `emitAuditEvent`.
- `mockEmitAuditEvent`: typed handle on `auditPort.emitAuditEvent`.
- `compromiseAudits()`: filters emitted audit calls to `system.api_keys.revoked_on_compromise`.
- `adminWithKey()`: creates a verified admin user, builds a tenant `TenantCallerContext` from `permissionsOfRole('admin')`, and mints an API key via `mint` (permission `read:WebhookSubscription`, 7-day expiry). It then logs in and returns the user, the bearer token and the key secret.
- `resetWith(token)`: posts to `/account/password/reset/confirm` with `REPLACEMENT_PASSWORD`.
- `makeDue()`: sets `nextAttemptAt` to epoch on all outbox rows, so the relay does not wait out its backoff.
- `pendingRows()`: queries `account.sessions_revoked` outbox rows with `status: 'pending'`.
- Test cases:
  - A throwing consumer (`apiKeyRepository.revokeMany` rejected once) leaves the row pending. After `makeDue()` and `relayOutbox()` the key is revoked and no pending rows remain.
  - Logout everywhere (`DELETE /account/sessions`) follows the same fail-then-retry path.
  - A rollback (`outboxEventModel.create` rejected) leaves no outbox row, returns status >= 400, and the old password still logs in.
  - A redelivery, with the published row reset to `pending`, does not produce a second compromise audit.

## Relationships
- `@tests/http`, `@tests/setup-test-db`, `@tests/environment`, `@tests/credentials`: provide the HTTP client, DB setup, env override (`NODE_MAIL_TRANSPORT: 'log'`), and `credentialOf` for checking whether a key secret still resolves.
- `@kernel/outbox`: supplies `outboxEventModel`, `relayOutbox` and `settleOutboxNudges`, which the tests use to inspect, mutate and drive the outbox.
- `@modules/api-keys/module`: `onRegistered?.()` is called at load to install the credential resolver, as a real boot does.
- `@modules/api-keys/services/api-keys`: `mint` creates the API key for each test.
- `@modules/api-keys/repository`: `apiKeyRepository.revokeMany` is spied on to inject failures.
- `@modules/users/tests/factories` (`createUser`, password constants) and `@modules/account/tests/factories` (`plantToken` seeds a password-reset token).
- `@kernel/access/tenant` (`DEPLOYMENT_TENANT_ID`), `@kernel/permissions` (`permissionsOfRole`) and the `TenantCallerContext` type from `@types` build the caller context.
- `@infrastructure/observability/audit`: mocked so compromise audits can be counted.

## Notes
- `setupTestDb()` and `apiKeysModule.onRegistered?.()` run at module top level. `jest.restoreAllMocks()` runs in `afterEach`, so the `revokeMany` and `create` spies do not leak between cases.
- Each test calls `settleOutboxNudges()` after the HTTP call, so any background relay nudges finish before assertions.
- The redelivery test relies on the relay delivering at least once. The consumer must be idempotent: the second pass finds nothing left to revoke, so the audit count stays at 1.
