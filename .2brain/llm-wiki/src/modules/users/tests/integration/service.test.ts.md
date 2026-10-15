---
source: src/modules/users/tests/integration/service.test.ts
sha256: 3cb524ca0696d1c5a9e665d090061a52ef0dcaa14eade79d50d0988eec80e66e
generated_at: 2026-10-15T12:15:28.355043+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service.test.ts

## Purpose

Integration test suite for `userService` exercising search, `getById`, and the admin create/update/delete flows against an in-memory Mongo instance provided by `setupTestDb`. It verifies permission-aware role grants, soft-delete vs. active semantics, lean-document presentation, audit/analytics side-effects, and outbox delivery without touching a real database or filesystem.

## Key elements

- **`expectCreated`** – wraps `userService.create`, asserts the `ResponseSuccess` envelope, and returns the `UserDocument`, saving each `create` test one assertion.
- **`seedActiveAndDeleted`** – creates three users (active, deactivated, deleted-but-active) to exercise the orthogonal `active` filter and soft-delete semantics.
- **`describe('userService.search')`** – covers default pagination, text/email/username partial-match filters, `active` true/false/unfiltered, page slicing, empty-collection meta, and phone decryption through `presentUser` on a lean (`.lean()`) item.
- **`describe('userService.getById')`** – happy path (hydrated Mongoose doc), missing-id → `undefined`, no-id → `undefined`.
- **`describe('userService.create')`** – role assignment via `assignRole`, default-role grant by moderators, escalation rejection, terms-accepted absence, and (truncated) additional permission/breach cases.
- **Jest mocks** – `@infrastructure/observability/audit` (with a `recordAudit` re-route), `@infrastructure/observability/analytics`, and `@infrastructure/adapters/image-store` (only `remove` stubbed).

## Relationships

- **`src/kernel/permissions.ts`** – imports `systemCallerContext` for system-level caller contexts in tests.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` is passed to `rolesOf` / `assignRole` calls to scope assertions to the tenant.
- **`src/modules/access/index.ts`** – `assignRole`, `rolesOf`, `membershipsOf`, `eraseMemberships` are called to verify or clean up role/membership state.
- **`src/modules/users/events.ts`** – `USER_SETUP_REQUESTED` is used to assert domain-event emission via `@kernel/events`.
- **`src/kernel/events.ts`** – `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` wire up event observation and cleanup.
- **`src/kernel/outbox.ts`** – `outboxEventModel`, `relayOutbox`, `settleOutboxNudges` drive outbox delivery assertions.
- **`src/modules/users/audit.ts`** – `usersAuditActions` names the audit events expected on audited actions.
- **`src/modules/users/analytics.ts`** – `usersAnalyticsEvents` names the analytics events expected.
- **`src/infrastructure/observability/audit.ts`** – mocked so `emitAuditEvent` is a spy; `recordAudit` is re-routed through that spy.
- **`src/infrastructure/observability/analytics/index.ts`** – mocked so `emitAnalyticsEvent` is a spy.
- **`src/infrastructure/http/response.ts`** – `ResponseSuccess` / `ResponseReject` types are used to unwrap and assert service result envelopes.
- **`src/modules/users/presenter.ts`** – `presentUser` is called directly to verify phone decryption on lean (plain-object) search results.
- **`src/modules/users/model.ts`** – `UserDocument` type parameterizes the `expectCreated` return and assertions.
- **`src/modules/users/erasure-registry.ts`** – `personalDataErasers` / `setPersonalDataErasers` are imported for erasure-flow tests.

## Notes

- **Audit mock re-route:** `recordAudit` internally closes over the *real* `emitAuditEvent` and is immune to the top-level jest mock. The mock factory explicitly re-implements `recordAudit` to call the spy `emitAuditEvent` after `actual.buildAuditEvent`, so a single spy sees every audit call.
- **Image store partial mock:** `applyImageWriteback` is kept real (it is a pure object mutation the tests depend on); only the filesystem-touching `remove` is stubbed.
- **Lean vs. hydrated:** `userService.search` returns plain objects (Mongoose `.lean()` path), unlike `getById` which returns a hydrated document. The phone-decryption test exists specifically to confirm `presentUser` handles both shapes.
- **`active` ≠ soft-delete:** A document can be `active: true` *and* `deletedAt` set; the `active` filter intentionally ignores `deletedAt`.
- **Caller context for create:** Tests use `callerContextAs('admin')` (or `'moderator'`) rather than `testCallerContext` because `create` always grants a membership, and an anonymous granter cannot grant anything.
