---
source: src/modules/users/tests/integration/service.test.ts
sha256: 1a89fd49033282017e53d8b244ff37d8dcffe50fa2176dbefd90a50e28015659
generated_at: 2026-11-08T08:57:15.261024+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service.test.ts

## Purpose

Integration test suite for `userService` that exercises validation, search, and the admin create/update/delete flows against an in-memory MongoDB instance (via `setupTestDb`). It verifies cross-cutting concerns the service depends on—role granting through `accessService`, domain-event dispatch via the kernel outbox, audit/analytics emission, and image-store hand-off—without hitting real filesystem, network, or database.

## Key elements

- **`expectCreated(...)`** — Helper that calls `userService.create`, asserts the `ResponseSuccess` envelope, and returns the unwrapped `UserDocument`, shortening every create-case by one assertion.
- **`seedActiveAndDeleted()`** — Seeds three users whose `active` and `deletedAt` fields deliberately disagree (active + deleted, deactivated + not deleted, active + not deleted) to prove the two facts are independent in the `search({ active })` filter.
- **`describe('userService.search')`** — Covers default pagination, text/email/username partial-match filters, the `active` boolean filter (including its independence from soft-delete), `.lean()`-path phone decryption through `presentAccount`, and empty-collection meta.
- **`describe('userService.getById')`** — Asserts a real Mongoose document is returned for existing IDs, and `undefined` for missing or absent IDs.
- **`describe('userService.create')`** — Covers: successful creation; image hand-off failure after commit (asserts 201 + `logger.error` call); absence of `termsAcceptedAt`/`termsVersion`; role membership written via `accessService.rolesOf`; and a moderator creating a plain customer with no role.
- **Jest mocks** — `@infrastructure/observability/audit` and `@infrastructure/observability/analytics` are replaced with plain `jest.fn()` factories (required by `observePort`); `@infrastructure/adapters/image-store` preserves the real `applyImageWriteback` while stubbing `imageStore.remove`.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is spied on to assert the post-commit image-handoff failure is logged with the correct `userId`.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` types shape the expected return envelopes of every service call.
- **`src/infrastructure/observability/audit.ts`** — Mocked so `observePort` can clear and inspect `usersAuditActions` invocations per test.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` stubbed to record `usersAnalyticsEvents` payloads without real network I/O.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` passed to `accessService.rolesOf` to assert role membership in the correct tenant scope.
- **`src/kernel/events.ts`** — `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` used to subscribe to / reset domain-event wiring between tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel`, `relayOutbox`, `settleOutboxNudges` drive assertions that create/update/delete flows enqueue the expected outbox entries (e.g. `USER_SETUP_REQUESTED`).
- **`src/kernel/permissions.ts`** — `systemCallerContext` available for tests that need the service-level (non-user) caller.
- **`src/kernel/registry.ts`** — `PersonalDataSubject` type parameterises erasure-registry assertions.
- **`src/modules/access/index.ts` / `src/modules/access/services/index.ts`** — `accessService.rolesOf` is the read-side assertion target for role-granting side effects of `create`.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` helper for pre-seeding role documents in access tests.
- **`src/modules/users/analytics.ts`** — `usersAnalyticsEvents` constants matched against the analytics mock calls.
- **`src/modules/users/audit.ts`** — `usersAuditActions` constants matched against the audit mock calls.
- **`src/modules/users/erasure-registry.ts`** — `personalDataErasers` / `setPersonalDataErasers` swapped per test to verify the erasure pipeline runs for the right subject.

## Notes

- The audit and analytics mocks must be **plain `jest.fn()`s**, not the real module exports, because `observePort` (from `@tests/ports`) needs to call `.mockClear()` and re-issue a new mock per test. Using the real (non-configurable) export would silently break that contract.
- The image-store mock intentionally keeps `applyImageWriteback` **real** (it is a pure in-memory mutation the tests depend on) and only stubs the filesystem-touching `remove`.
- `search()` goes through the `.lean()` repository path, so `presentAccount` receives a plain JS object—not a hydrated Mongoose document. This is the only read path in the suite where that distinction matters.
- The `active` filter and `deletedAt` (soft-delete) are **independent columns**; a deleted-but-active user still appears in `search({ active: true })`. Tests explicitly assert this to prevent accidental coupling.
- The file is truncated in the source; additional `describe` blocks (update, delete, erasure) are expected beyond what is visible here.
