---
source: src/modules/orders/tests/integration/delete-restore-audit.test.ts
sha256: 41d7e5386a7471493439ad73a013306649e1af7d4a22f1b3f91a31d0018a1daa
generated_at: 2026-11-14T20:50:03.995378+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/delete-restore-audit.test.ts

## Purpose

Integration tests that verify `orderService.removeById` and `orderService.restoreById` emit the correct audit events (`ORDER_DELETED`, `ORDER_RESTORED`) with the expected fields. They exist to pin that audit logging was moved from the controller layer into the service layer (module-lifecycle rule 1) without losing the audit trail.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the audit port module at load time with `auditPortMock()` from `tests/support/ports`. This is a full module replacement, not a spy.
- **`describe('removeById')`** — Two cases: soft delete (`hardDelete: false`) and hard delete (`hardDelete: true`), each asserting `emitAuditEvent` is called with `ORDER_DELETED`, the correct `metadata.hardDelete` flag, `outcome: 'success'`, and the order's id as `targetId`.
- **`describe('restoreById')`** — Seeds a canceled order, removes it, then restores it; asserts `emitAuditEvent` is called with `ORDER_RESTORED` and the order's id.
- **`observePort(auditPort.emitAuditEvent)`** — Wraps the port method to get a Jest spy for assertions.
- **`callerContextAs('admin')`** — Builds a caller identity context passed into each service call.

## Relationships

- **`src/modules/orders/services/index.ts`** — The service module under test; this file invokes its `removeById` and `restoreById` methods to trigger the audit emissions being asserted.
- **`src/modules/orders/audit.ts`** — Source of the audit action constants (`ORDER_DELETED`, `ORDER_RESTORED`) referenced in the expectations.
- **`src/infrastructure/observability/audit.ts`** — The module whose interface is replaced at load time so that `emitAuditEvent` can be observed through the port mock.
- **`tests/support/ports.ts`** — Provides the port mock factory used by the `jest.mock` call and the `observePort` spy wrapper used in assertions.
- **`tests/support/setup-test-db.ts`** — Initialises the in-memory test database before the test suite runs.
- **`tests/support/callers.ts`** — Provides `callerContextAs` for constructing caller identity objects.
- **`src/modules/orders/tests/factories.ts`** — Provides `seedOrder` for creating fixture orders with a given status.
- **`src/types/index.ts`** — Provides the `OrderStatus` enum used when seeding orders.

## Notes

- The audit port is **replaced**, not spied on. The comment explains that `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes, so a full `jest.mock` is required. See the sibling `create-audit.test.ts` for the full reasoning.
- The tests assert on `expect.objectContaining(…)` rather than exact object equality, so new fields added to the audit event won't break these tests.
- `afterEach(() => jest.restoreAllMocks())` is present even though the primary interaction is a module-level mock; it guards against any incidental `spyOn` usage in the mock factory.
