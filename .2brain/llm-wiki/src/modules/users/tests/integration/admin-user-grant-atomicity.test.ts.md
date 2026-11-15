---
source: src/modules/users/tests/integration/admin-user-grant-atomicity.test.ts
sha256: 84aaf8d6d1fd7c8086fc2bc6c3cdad4aa9c26abd1626e9b1c80006de2eed0493
generated_at: 2026-11-14T22:33:30.460195+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/admin-user-grant-atomicity.test.ts

## Purpose

Integration tests that verify the atomicity guarantee between user creation/role assignment and the underlying role-grant (membership) write. If the membership write fails, no partial user row should remain. Also asserts that a role-escalation attempt is rejected and audited without any write.

## Key elements

- **`failMembershipWrites`** – Spies on `membershipModel.findOneAndUpdate` and returns a stub whose `exec` rejects with `"mongo is down"`, simulating an infrastructure failure at the access layer.
- **`jest.mock('@infrastructure/observability/audit', …)`** – Replaces `emitAuditEvent` with a spy function so `observePort` can track calls; delegates `recordAudit` to the real `buildAuditEvent` to construct the event payload.
- **`describe('userService.create')`** – Two tests:
  - *Role-escalation refusal*: a `moderator` requesting `role: 'admin'` gets a 403, `userRepository.create` is never called, and an audit event with `action: ROLE_ASSIGNED`, `outcome: 'failure'` is emitted.
  - *Membership-write failure*: with both the membership write **and** `deleteOne` forced to reject, the service rejects and `findOne` confirms no row was persisted.
- **`describe('the role door')`** – One test: `assignUserRole` on an existing customer, with the membership write failing, results in neither a role change nor an `updatedAt` bump on the user record.

## Relationships

- **`src/modules/users/services/index.ts`** – Provides `userService`, the unit under test (`create`, `assignUserRole`).
- **`src/modules/users/repository.ts`** – The persistence layer whose `create` and `deleteOne` methods are spied on to assert no partial writes occurred.
- **`src/modules/users/tests/factories.ts`** – Supplies `createUser` (seeds a real row via the test DB) and re-exports `userRepository` for assertions and `deleteOne` mocking.
- **`src/modules/access/tests/factories.ts`** – Exports `membershipModel` (spied in `failMembershipWrites`) and `accessAuditActions` (asserted in the audit spy).
- **`src/modules/access/audit.ts`** – Owner of the `membershipModel` write that is forced to fail; also defines the audit action constants referenced in assertions.
- **`src/infrastructure/observability/audit.ts`** – Mocked to replace `emitAuditEvent` with a spy; the real `recordAudit`/`buildAuditEvent` are preserved for event construction.
- **`tests/support/setup-test-db.ts`** – Initialises a real database for the integration run.
- **`tests/support/callers.ts`** – `callerContextAs('moderator' | 'admin')` builds the authenticated caller context passed to service calls.
- **`tests/support/ports.ts`** – `observePort` wraps the mocked `emitAuditEvent` spy so test bodies can assert on emitted events.
- **`tests/support/stub.ts`** – `asStub` creates a minimal object (with `exec`) whose return value is a rejected promise, typed against the real model return.

## Notes

- The audit mock is mandatory because `observePort` (in `tests/support/ports.ts`) requires a plain spy at the top level of the mocked module; a real async function would not be observable.
- The "leaves no row" test intentionally also rejects `deleteOne`, encoding the design decision that the atomicity guarantee must hold even if a compensating delete itself fails.
- `afterEach(jest.restoreAllMocks)` restores all spies; the audit mock persists across tests via `jest.mock` (module-level), while individual `jest.spyOn` calls are torn down per test.
- The `membershipModel` write lives in the **access** module, not the users module — the failure is injected at that boundary to test the cross-module transactional contract.
