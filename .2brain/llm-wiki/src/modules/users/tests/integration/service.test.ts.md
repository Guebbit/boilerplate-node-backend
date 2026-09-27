---
source: src/modules/users/tests/integration/service.test.ts
sha256: 8e057a847c839271b583c61b3c69312132a8ec0fdfc106b9ec43f9a06dfa5768
generated_at: 2026-09-27T15:40:13.719570+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service.test.ts

## Purpose

Integration test suite for `userService` (validation, search, create, update, delete) running against an in-memory MongoDB via `setupTestDb`. It verifies end-to-end service behaviour — validation rules, query filters, pagination, audit emission, event dispatch, erasure-registry callbacks, and access-role assignment — without hitting a real database or filesystem.

## Key elements

- **`jest.mock('@infrastructure/observability/audit')`** — Replaces `emitAuditEvent` with a spy and rewrites `recordAudit` to route through that spy (because the real `recordAudit` closes over its own module-level `emitAuditEvent`).
- **`jest.mock('@infrastructure/adapters/image-store')`** — Spreads the real module and overrides only `imageStore.remove` with a no-op `jest.fn()`, keeping `applyImageWriteback` functional.
- **`expectCreated(...args)`** — Helper that awaits `userService.create`, asserts the success envelope, and returns the `UserDocument`. Used by every `describe('userService.create')` case except the breach case.
- **`seedActiveAndDeleted()`** — Seeds three users with deliberately disagreeing `active` / `deletedAt` combinations to exercise filter semantics.
- **`describe('userService.validateData', …)`** — Covers email/username/password validation, wrong-typed `active`, declared role names, relative `imageUrl`, unknown keys, and i18n message shape.
- **`describe('userService.search', …)`** — Covers text/email/username filters, `active` vs soft-delete independence, pagination, and phone decryption on the `.lean()` path.
- **`describe('userService.create', …)`** (truncated in snippet) — Admin create flow, audit, events, erasure-registry, and access-role assignment.
- Imports `personalDataErasers` / `setPersonalDataErasers` to assert the erasure registry is invoked during lifecycle operations.
- Imports `onDomainEvent` / `resetDomainEvents` to observe domain events (`USER_SETUP_REQUESTED`) emitted by the service.

## Relationships

- **`src/modules/users/service.ts`** — System under test; every `describe` block calls its exported functions (`create`, `search`, `updateById`, `validateData`, …).
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` (DB seeding helper) and the `PLAIN_PASSWORD` / `REPLACEMENT_PASSWORD` constants used throughout.
- **`tests/support/callers.ts`** — Supplies `testCallerContext` and `callerContextAs` for permission-scoped calls.
- **`src/kernel/permissions.ts`** — Source of `systemCallerContext` (bypasses tenant/role checks).
- **`src/kernel/access/tenant.ts`** — Source of `DEPLOYMENT_TENANT_ID` used in tenant-scoped assertions.
- **`src/infrastructure/observability/audit.ts`** — Mocked; tests assert on `emitAuditEvent` spy and the `usersAuditActions` constants from the module's own `audit.ts`.
- **`src/kernel/events.ts`** — `onDomainEvent` / `resetDomainEvents` let tests subscribe to and clear the global event bus.
- **`src/modules/access/index.ts`** — `assignRole`, `membershipsOf`, `rolesOf` are called to verify role/membership side-effects of user creation.
- **`src/modules/users/erasure-registry.ts`** — `setPersonalDataErasers` registers stubs; tests assert the registry is invoked on delete/erasure paths.
- **`src/modules/users/model.ts`** — `toUser` is used to verify decryption (e.g. phone) on lean documents returned by `search`.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` type guards used in assertions and the `expectCreated` helper.

## Notes

- **Audit mock subtlety:** `recordAudit` in the real module closes over its *own* `emitAuditEvent`, so simply mocking `emitAuditEvent` is insufficient. The mock redefines `recordAudit` to call the spy directly. Forgetting this makes `recordAudit`-based audit assertions silently pass against the real (unmocked) emitter.
- **Image-store mock:** Only `remove` is stubbed. `applyImageWriteback` is a pure in-memory mutation the tests depend on for real image-URL writeback; the spread-then-override pattern preserves it.
- **`.lean()` vs hydrated:** `search()` returns plain objects (Mongoose `.lean()`). Tests that assert `toUser` decryption (e.g. phone) must account for this — `toUser` must handle a non-hydrated document.
- **Validation is intentionally non-strict:** Unknown body keys (e.g. `id` on a PUT) are tolerated. The `active` field, however, *must* be validated at the service layer because a wrong type propagates to Mongoose and produces a 500 CastError instead of the contractual 422.
- **`imageUrl` contract:** Accepts a `uri-reference` (server-relative path like `/uploads/…`), not a full absolute `uri`. Tests guard against a regression to strict-URL validation.
- **i18n assertion strategy:** Rather than matching specific copy text (which changes), the test asserts the error `message` does *not* match the shape of a raw i18n key (dotted identifier, no spaces) and that each error carries `details.field` for form-level highlighting.
