---
source: src/modules/api-keys/tests/integration/outcomes.test.ts
source_sha256: f75c45a7ec2d29fdc629cf690b541ffb42ac50065d35f30ce32c55016237dbb4
context_sha256: e56f0e475c38c896cd14fe57e0188f32560b157e86e457c1223e5f9a241ef54e
generated_at: 2026-11-22T04:24:55.496130+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/integration/outcomes.test.ts

## Purpose
Integration tests for the API-key (credential) service's observable outcomes: listing, the one-year expiry ceiling, the wording of refusals, audit rows, and the locale of queued mails. They call the service directly rather than through HTTP, because the HTTP-level contract suite is not part of the mutation ruler. Permission-subset rules are covered separately in `api-keys.contract.test.ts`.

## Key elements
- **`mockOutbox`**: array collecting every mail queued. The `enqueueEmail` mock of `@infrastructure/adapters/mailer` pushes `{to, subject, template, data}` into it. It is named `mock*` so the hoisted `jest.mock` can close over it.
- **Audit port mock**: `@infrastructure/observability/audit` is replaced with `auditPortMock()` from `@tests/ports`. `mockEmitAuditEvent` is the typed handle to `emitAuditEvent`.
- **`setupTestDb()`**: sets up the test database. A `beforeEach` clears the outbox and audit mock, calls `resetDomainEvents()`, and calls `registerModules(enabledModules)`.
- **Helpers**:
  - `createRealUser(id, locale?)` persists a user through `userRepository`.
  - `contextFor(userId, permissions, tenantId)` builds a `TenantCallerContext`. It defaults to `read:WebhookSubscription` and `TEST_TENANT_ID`.
  - `eventually(done)` polls for up to 2s (40 × 50ms), for mails the code under test does not await.
  - `auditedAs(action)` filters recorded audit events by action.
  - `mintKey(context, name)` mints a key and throws if it was refused.
  - `expireAt(id, date)` rewrites a stored key's expiry via `apiKeyRepository`.
  - `IN_A_WEEK` is the default valid expiry.
- **`describe('the one-year ceiling')`**: covers `latestExpiry`.
  - It is a calendar year, not 365 days, across a leap day.
  - `mint` refuses an expiry past the ceiling with a 422 `VALIDATION_ERROR` whose `details.field` is `expiresAt`.
  - The exact ceiling is accepted and one millisecond past it is refused, using `freezeDate`.
- **`describe('what a refusal says')`**: a mint of a permission the minter cannot grant (`display:Order`) is refused. The error carries a message and `details.permissions`.
- **`describe('listing')`**:
  - `list` is tenant-scoped and newest first.
  - Each item carries a status of `active`, `revoked`, `expired` or `suspended`. Suspended means the minter was deactivated. `revoked` takes precedence over `suspended`.
  - `sort` can be `expiresAt` or `-expiresAt`, and the result publishes `maxExpiresAt`.
  - `findOwnApiKeys(userId)` returns only that user's keys, newest first.
- **`describe('minting leaves an audit row and a mail')`**: begins with a test that the mint is audited under `apiKeysAuditActions.ADMIN_API_KEY_MINTED` with the granted permissions. The visible content ends there.

## Relationships
- Exercises `services/api-keys` (`mint`, `revoke`, `list`, `latestExpiry`, `findOwnApiKeys`), `repository` (`apiKeyRepository`) and `audit` (`apiKeysAuditActions`) from the api-keys module.
- Uses `userRepository` from `@modules/users/tests/factories` to create users and to deactivate them (via `updateMany`) for the suspended status. It also imports `userService` from `@modules/users`.
- Uses `registerModules` from `@kernel/registry` with `enabledModules` from `src/modules.ts`, and `resetDomainEvents` / `emitDomainEvent` from `@kernel/events`. The module wiring is rebuilt before each test.
- Imports `ACCOUNT_SESSIONS_REVOKED` from `@modules/account` and `logger` from `@infrastructure/adapters/logger`. Their use falls in the part of the file not shown here.
- Replaces `@infrastructure/observability/audit` and the mailer's `enqueueEmail` with mocks.
- Builds contexts of type `TenantCallerContext` from `@types`.

## Notes
- The audit module is replaced with a mock rather than spied on, because `recordAudit` closes over its own module's `emitAuditEvent`.
- Mail sending is not awaited by the code under test, so tests that check mails use `eventually`.
- `afterEach` restores real timers and mocks. Date-sensitive cases use `freezeDate` from `@tests/clock`.
- Cross-tenant isolation is tested by minting with a different `tenantId` in `contextFor`.
