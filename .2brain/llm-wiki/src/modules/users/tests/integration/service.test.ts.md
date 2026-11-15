---
source: src/modules/users/tests/integration/service.test.ts
sha256: 5a2eff69dee90ea2d7bb41079112be6d4869ba2bf83e7b3afe0234d41e815da4
generated_at: 2026-11-14T22:38:43.810065+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service.test.ts

## Purpose

Integration test suite for `userService` exercising validation, search, and the admin create / update / delete flows against an in-memory MongoDB wired up by `setupTestDb`. It verifies business-level behavior (pagination, filtering, role assignment, image hand-off, terms recording) end-to-end without hitting a real database or filesystem.

## Key elements

- **`setupTestDb()`** — boots the in-memory Mongo instance for the whole file; called once at module scope.
- **`expectCreated(...)`** — helper that calls `userService.create`, asserts the success envelope, and unwraps the `UserDocument`, keeping individual create tests one assertion shorter.
- **`seedActiveAndDeleted()`** — seeds three users whose `active` and `deletedAt` fields deliberately disagree, backing the three "active filter" cases.
- **`describe('userService.search', …)`** — covers default pagination, text/email/username partial-match filters, `active` vs. soft-delete distinction, pagination math, empty-collection meta, and phone decryption through `presentAccount` on a `.lean()` result.
- **`describe('userService.getById', …)`** — verifies a real Mongoose document is returned (has `.save`), and `undefined` for missing/absent IDs.
- **`describe('userService.create', …)`** — verifies document creation, post-commit image-handoff failure logging, absence of `termsAcceptedAt`/`termsVersion` for admin-created users, role granting via `accessService`, and moderator-created customers holding no role.
- **`jest.mock` for audit / analytics / image-store** — replaces the non-configurable real exports with plain jest mocks so `observePort` can clear and re-hand them; image-store keeps `applyImageWriteback` real and stubs only `imageStore.remove`.
- **`callerContextAs('admin' | 'moderator')`** — simulates authenticated caller context; distinct from `systemCallerContext` (kernel) which is imported for system-level caller paths.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — fully mocked via `auditPortMock()`; tests assert audit events are emitted for create/update/delete flows.
- **`src/infrastructure/observability/analytics/index.ts`** — mocked; `emitAnalyticsEvent` is a jest mock so tests can assert which `usersAnalyticsEvents` fired.
- **`src/infrastructure/adapters/logger.ts`** — spied on to assert the post-commit image-handoff failure is logged with the correct `userId`.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` types shape the envelope assertions in `expectCreated` and reject-path tests.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` is the tenant argument passed to the access module when verifying granted roles.
- **`src/kernel/permissions.ts`** — `systemCallerContext` is imported for tests that exercise system-level (non-user) caller paths.
- **`src/kernel/registry.ts`** — `PersonalDataSubject` type used when registering or asserting entries in the erasure registry.
- **`src/kernel/events.ts`** — `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` manage the domain-event bus between tests (e.g. `USER_SETUP_REQUESTED`).
- **`src/kernel/outbox.ts`** — `outboxEventModel`, `relayOutbox`, `settleOutboxNudges` are used to assert that outbox rows are written and relayed as part of create/update flows.
- **`src/modules/access/index.ts`** — `accessService` is the read path used to verify that `create` grants the named role and that a plain customer gets none.
- **`src/modules/access/services/index.ts`** — service-layer access checks exercised during create/update permission assertions.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` inserts a pre-existing role membership for tests that depend on an already-granted role.
- **`src/modules/users/erasure-registry.ts`** — `setPersonalDataErasers` / `personalDataErasers` are used to register and assert eraser wiring during create/delete.
- **`src/modules/users/audit.ts`** — `usersAuditActions` enumerates the audit action names asserted against the mocked audit port.
- **`src/modules/users/analytics.ts`** — `usersAnalyticsEvents` enumerates the analytics event names asserted against the mocked analytics port.

## Notes

- The audit and analytics `jest.mock` calls **must** resolve to a plain jest mock (not the real, non-configurable export) because `observePort` (from `@tests/ports`) needs to `.mockClear()` and reassign the mock between tests. The inline comment in the file calls this out explicitly.
- The image-store mock intentionally keeps `applyImageWriteback` real (a pure in-memory mutation) and stubs only the filesystem-touching `imageStore.remove`.
- `search()` returns **lean** (plain-object) results via `.lean()` in the repository; `getById` returns a **hydrated** Mongoose document. The phone-decryption test exists specifically to confirm `presentAccount` handles both shapes.
- The `active` filter and `deletedAt` are **independent** columns; a user can be `active: true` and `deletedAt: <date>` simultaneously. The seed helper and two filter tests document this intentionally.
- `termsAcceptedAt` / `termsVersion` are **never** set by `userService.create` — admin creation does not imply the user saw the terms text.
- Role granting during create goes through the access module (membership document), not a field on the user document itself.
