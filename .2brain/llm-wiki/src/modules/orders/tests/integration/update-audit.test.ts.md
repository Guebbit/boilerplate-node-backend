---
source: src/modules/orders/tests/integration/update-audit.test.ts
sha256: 70597af8f0d856c26f99c9a9506bf4d935285c310e1510291f2f7d16ba8e07ff
generated_at: 2026-10-29T04:58:15.694060+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/update-audit.test.ts

## Purpose

Integration test verifying that the `ORDER_UPDATED` audit event records *which* fields an admin changed (by name) but never the field *values*—specifically guarding that personal data like an email address never leaks into the audit metadata.

## Key elements

- **`updatedMetadata(spy)`** — Helper that walks the mocked `emitAuditEvent` call log, finds the entry whose `action` is `ORDER_UPDATED`, and returns its `metadata` object.
- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the entire audit port module with `auditPortMock()` from `tests/support/ports.ts`. The real implementation is never loaded.
- **Test: "names the email when it moved, without its value"** — Updates an order's email to a different value; asserts `metadata.changedFields` equals `['email']` and that no email value is present.
- **Test: "writes nothing for the email it already holds"** — Sets the email to the value it already has; asserts `metadata` is `{}` (no `changedFields` key at all).

## Relationships

- **`src/infrastructure/observability/audit.ts`** — The audit port under test. Fully replaced by the mock; the test never exercises its real logic.
- **`src/modules/orders/audit.ts`** — Supplies the `ORDER_UPDATED` action constant used to filter the audit log.
- **`src/modules/orders/services/index.ts`** — Exports `orderService`, whose `updateById` method is the SUT.
- **`src/modules/orders/tests/factories.ts`** — Provides `createOrder` and `toOrderItem` for seeding fixture data.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the product referenced by the order item.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds the buyer with a known email.
- **`tests/support/callers.ts`** — `callerContextAs('admin')` injects the caller identity the service expects.
- **`tests/support/ports.ts`** — `observePort` wraps a function for call inspection; `auditPortMock` is the factory used inside the `jest.mock` call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions a real database so this is an integration (not unit) test.

## Notes

- The audit port is **replaced, not spied on**. `jest.mock` swaps the whole module; there is no partial mock or `jest.spyOn` on the real implementation.
- The "no-op" test expects `{}`, not `{ changedFields: [] }`. If the service ever emits an empty array, this assertion will catch it.
- `afterEach` calls `jest.restoreAllMocks()`, so each test starts with a clean spy state; no manual reset is needed between cases.
