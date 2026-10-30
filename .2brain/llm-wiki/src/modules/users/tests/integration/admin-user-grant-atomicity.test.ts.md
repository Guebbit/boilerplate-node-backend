---
source: src/modules/users/tests/integration/admin-user-grant-atomicity.test.ts
sha256: 12ceab22d1aea86e5b049895dd90f9706bb0dac8c44d4d404b0887f4b77c1cbc
generated_at: 2026-10-29T06:19:54.304891+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/admin-user-grant-atomicity.test.ts

## Purpose

Integration tests that verify the atomicity contract between user write and role (membership) grant: if the membership write fails, no partial user row is left behind, and a refused escalation is still audited. Covers both `userService.create` and `userService.updateById`.

## Key elements

- **`failMembershipWrites()`** — Spies on `membershipModel.findOneAndUpdate` and returns a stub whose `exec()` rejects with `"mongo is down"`, simulating an infrastructure-level failure on the access-side write.
- **`describe('userService.create')`**
  - *escalation refusal*: a `moderator` caller requesting `role: 'admin'` → expects `{ success: false, status: 403 }`, no `userRepository.create` call, and an audit event with `action: ROLE_ASSIGNED`, `outcome: 'failure'`.
  - *role-write failure*: `failMembershipWrites()` **and** a mocked `userRepository.deleteOne` rejection → expects the service call to throw and **no** user row to exist afterward (proves no compensating delete is needed).
- **`describe('userService.updateById')`**
  - *escalation refusal on update*: same 403 + audit assertions, additionally checking `targetId` on the audit event.
  - *role-write failure on update*: `failMembershipWrites()` → service throws `"mongo is down"`, and `userRepository.findById` confirms the pre-update username is unchanged.
- **`jest.mock('@infrastructure/observability/audit')`** — Replaces `emitAuditEvent` with a plain `jest.fn()` and routes `recordAudit` through `buildAuditEvent`, enabling the `observePort` assertion pattern.

## Relationships

- **`src/modules/users/services/index.ts`** — Exports the SUT `userService` (`create`, `updateById`).
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` helper and the `userRepository` spy target.
- **`src/modules/users/repository.ts`** — `userRepository` methods (`create`, `deleteOne`, `findOne`, `findById`) are spied/asserted to verify no partial state.
- **`src/modules/access/tests/factories.ts`** — Exports `membershipModel` (spied on to force failure) and `accessAuditActions` (enum values used in audit assertions).
- **`src/modules/access/audit.ts`** — Source of the `ROLE_ASSIGNED` action constant.
- **`src/infrastructure/observability/audit.ts`** — Mocked; `emitAuditEvent` is observed via `observePort` to assert audit emission.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory DB for the suite.
- **`tests/support/callers.ts`** — `callerContextAs` builds role-scoped caller contexts (`'moderator'`, `'admin'`).
- **`tests/support/ports.ts`** — `observePort` wraps a `jest.fn()` for clean assertion; `asStub` shapes the mock return.
- **`tests/support/stub.ts`** — `asStub` used by `failMembershipWrites` to type the fake `exec` return.

## Notes

- The create-failure test deliberately also mocks `userRepository.deleteOne` to reject, proving the fix does not depend on a compensating delete (a former source of partial state).
- `observePort` requires a plain `jest.fn()` behind the namespace object (see comment in the mock); replacing it with a partial object would break observation.
- `afterEach` calls `jest.restoreAllMocks()`; the `jest.mock` factory is not restored, so the audit module stays intercepted for the whole file.
