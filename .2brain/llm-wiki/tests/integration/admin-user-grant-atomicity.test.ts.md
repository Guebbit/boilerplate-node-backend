---
source: tests/integration/admin-user-grant-atomicity.test.ts
sha256: 6d60df10ef30f4e4e1a9c453c8a0cb967732693380ef289718228afa02a4dd4d
generated_at: 2026-10-15T12:43:18.788595+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/admin-user-grant-atomicity.test.ts

## Purpose

Integration tests that verify a user create/update and its accompanying role grant behave as a single atomic unit: if the grant is refused (escalation check) or fails at the infrastructure level, no partial user row is left behind, and the refusal is audited. The tests deliberately force the `access` membership write to fail and then inspect the database to confirm the `users` write was rolled back.

## Key elements

- **`failMembershipWrites()`** — Spies on `membershipModel.findOneAndUpdate` and returns a stub whose `exec` rejects, simulating a mid-transaction infrastructure failure.
- **`jest.mock('@infrastructure/observability/audit')`** — Replaces the audit module with a version whose `recordAudit` routes through a captured `emitAuditEvent` `jest.fn()`, enabling `observePort` to assert on emitted events.
- **`describe('userService.create')`**
  - *"writes nothing…when the role is an escalation"* — A `moderator` attempts to create a user with `role: 'admin'`; asserts `AccessInvariantError`, zero `userRepository.create` calls, and an audit event with `outcome: 'failure'`.
  - *"leaves no row when the role write fails…"* — An `admin` creates a user; the membership write is forced to reject and `userRepository.deleteOne` is also made to fail. Asserts the row is absent.
- **`describe('userService.updateById')`**
  - *"audits a refused role grant…"* — A `moderator` updates an existing user to `role: 'admin'`; asserts the audit event targets the correct `user.id`.
  - *"commits none of the update when its role write fails"* — An `admin` renames a user and changes role; the membership write rejects. Asserts the username in the DB is unchanged.

## Relationships

- **`src/modules/users/index.ts`** — Source of `userService` (the `create` / `updateById` methods under test).
- **`src/modules/users/repository.ts`** — `userRepository` is spied on to verify writes did not occur and queried directly to confirm DB state.
- **`src/modules/users/tests/factories.ts`** — `createUser` helper seeds a known row before the update tests.
- **`src/modules/access/model.ts`** — `membershipModel` is the write target that is forced to fail via spy.
- **`src/modules/access/audit.ts`** — `accessAuditActions` provides the action constants (`ROLE_ASSIGNED`) used in audit assertions.
- **`src/infrastructure/observability/audit.ts`** — Mocked at module level; its `recordAudit`/`buildAuditEvent` are wrapped so `emitAuditEvent` is observable.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions a real (or in-memory) database for the integration run.
- **`tests/support/callers.ts`** — `callerContextAs('moderator')` / `('admin')` builds the caller identity passed to service calls.
- **`tests/support/stub.ts`** — `asStub` types the fake return object for `findOneAndUpdate`.
- **`tests/support/ports.ts`** — `observePort` wraps the captured `jest.fn()` so test code can assert on port emissions without tight coupling.

## Notes

- The audit mock is intentionally non-trivial: `observePort` requires a plain `jest.fn()` behind the namespace, so the mock re-wraps `recordAudit` to call `emitAuditEvent` (the captured fn) after building the event via the real `buildAuditEvent`. Simply stubbing `emitAuditEvent` alone would not work because production code calls `recordAudit`, not `emitAuditEvent`.
- The "half-made account" test also makes `deleteOne` reject, explicitly proving the rollback relies on the transaction boundary rather than a compensating delete.
- `afterEach(() => jest.restoreAllMocks())` restores every spy; the module-level audit mock persists across tests by design (it is set up once before the suite).
