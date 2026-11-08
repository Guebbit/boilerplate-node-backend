---
source: src/modules/orders/tests/integration/update-audit.test.ts
sha256: 70597af8f0d856c26f99c9a9506bf4d935285c310e1510291f2f7d16ba8e07ff
generated_at: 2026-11-08T07:11:20.434644+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/update-audit.test.ts

## Purpose

Integration test verifying that the `ORDER_UPDATED` audit row records only the **name** of a changed field (e.g. `email`) in its `metadata.changedFields`, never the field's value. This enforces the rule that personal data must not leak into audit logs.

## Key elements

- **`updatedMetadata(spy)`** – helper that scans all recorded `emitAuditEvent` calls for the one whose `action` is `ordersAuditActions.ORDER_UPDATED` and returns its `metadata`.
- **`jest.mock('@infrastructure/observability/audit', …)`** – replaces the entire audit module with `auditPortMock()` from `tests/support/ports.ts` rather than spying on the real implementation.
- **Test 1 – "names the email when it moved, without its value"** – updates the order email to a different address and asserts `metadata` equals `{ changedFields: ['email'] }`.
- **Test 2 – "writes nothing for the email it already holds"** – sets the email to its current value and asserts `metadata` is an empty object (no `changedFields` key at all).

## Relationships

- **`src/infrastructure/observability/audit.ts`** – the module under test is *mocked away*; the test never calls the real `emitAuditEvent`.
- **`src/modules/orders/audit.ts`** – provides `ordersAuditActions.ORDER_UPDATED`, used to filter the correct audit row.
- **`src/modules/orders/services/index.ts`** – exports `orderService.updateById`, the function whose side-effect (emitting an audit event) is under test.
- **`src/modules/orders/tests/factories.ts`** – supplies `createOrder` and `toOrderItem` to seed a realistic order.
- **`src/modules/users/tests/factories.ts`** – `createUser` for the order's buyer.
- **`src/modules/products/tests/factories.ts`** – `createProduct` for the order item.
- **`tests/support/callers.ts`** – `callerContextAs('admin')` builds the caller context passed to `updateById`.
- **`tests/support/ports.ts`** – `auditPortMock()` replaces the port; `observePort()` wraps the mocked function into a Jest spy.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory/test database before the suite runs.

## Notes

- The audit module is **replaced wholesale** via `jest.mock`, not decorated with `jest.spyOn`. This means any other module that imports the audit port in the same test run also sees the mock — keep this in mind if you add unrelated tests to the file.
- `afterEach(() => jest.restoreAllMocks())` restores the mock after each test; do not remove it or calls will accumulate across tests.
- The empty-object assertion in test 2 (`toEqual({})`) is intentional: when no field actually changes, the service omits `changedFields` entirely rather than writing an empty array.
