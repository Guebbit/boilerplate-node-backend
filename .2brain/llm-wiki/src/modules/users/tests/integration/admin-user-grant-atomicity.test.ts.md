---
source: src/modules/users/tests/integration/admin-user-grant-atomicity.test.ts
sha256: 12ceab22d1aea86e5b049895dd90f9706bb0dac8c44d4d404b0887f4b77c1cbc
generated_at: 2026-11-08T08:53:31.618157+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/admin-user-grant-atomicity.test.ts

## Purpose

Integration tests proving that a `userService.create` or `userService.updateById` call and its associated role-grant write are a single atomic unit: a refusal produces no write but does emit an audit event, and an infrastructure failure during the role write leaves the user record unchanged (no half-made account, no need for a compensating delete).

## Key elements

- **`failMembershipWrites()`** – Spies on `membershipModel.findOneAndUpdate` (from `@modules/access/tests/factories`) and makes it reject with `"mongo is down"`, simulating an infrastructure-level write failure on the access side.
- **`jest.mock('@infrastructure/observability/audit', …)`** – Replaces `emitAuditEvent` with a bare `jest.fn()` and wraps `recordAudit` so that, when a context is present, it calls the real `buildAuditEvent` and then emits through the spy. This lets tests assert on audit events without a real sink.
- **`describe('userService.create')`**
  - *Escalation refusal*: a `moderator` requesting `role: 'admin'` gets `{ success: false, status: 403 }`; `userRepository.create` is never called; `emitAuditEvent` receives a `ROLE_ASSIGNED / failure` event with the target role in metadata.
  - *Role write failure*: both `membershipModel` write and `userRepository.deleteOne` are forced to reject; the test asserts no user row exists afterward (no compensating delete path is needed).
- **`describe('userService.updateById')`**
  - *Refused grant audited*: a `moderator` changing an existing user's role to `admin` gets 403; audit event includes the target user's `id`.
  - *Role write failure rolls back*: the membership write rejects; the user's pre-update username is still persisted (the whole update is rolled back).

## Relationships

- **`src/modules/users/services/index.ts`** – `userService.create` and `userService.updateById` are the functions under test.
- **`src/modules/users/repository.ts`** – `userRepository` is spied on to assert that no write (or compensating delete) occurred.
- **`src/modules/access/tests/factories.ts`** – Supplies `membershipModel` (the write target that is forced to fail) and `accessAuditActions` (audit action constants used in assertions).
- **`src/infrastructure/observability/audit.ts`** – Mocked at module level; `emitAuditEvent` is the observation point for audit assertions.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser` (seeds a user in the test DB) and re-exports `userRepository`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory MongoDB used by the repository.
- **`tests/support/callers.ts`** – `callerContextAs(role)` fabricates the caller identity for privilege simulation.
- **`tests/support/ports.ts`** – `observePort` wraps a `jest.fn()` from the mocked namespace into a spy usable in assertions.
- **`tests/support/stub.ts`** – `asStub` creates a partial mock for `findOneAndUpdate`'s return shape.

## Notes

- The atomicity boundary is the **access** module's membership write, not the users repository: the service checks the grant *before* any user write, so the test forces the *access-side* write to fail to exercise the rollback path.
- The `jest.mock` factory spreads `...actual` to preserve `buildAuditEvent` and other exports while only replacing `emitAuditEvent` and `recordAudit`. The `recordAudit` wrapper is a no-op when `context` is falsy, matching the real module's guard.
- `afterEach(() => jest.restoreAllMocks())` is called once at the top level; the `jest.mock` factory is **not** restored by this — it persists for the whole file (intentional, since every test needs the audit spy).
- The delete-failure assertion in the `create` test is deliberately pessimistic: it forces `deleteOne` to reject as well, verifying that the code path does not *rely* on a compensating delete to clean up a half-created account.
