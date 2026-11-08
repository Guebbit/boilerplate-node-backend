---
source: src/modules/products/tests/integration/delete-restore-audit.test.ts
sha256: e978525e97754d3975ac717651d961372fab4542510b1ba24a60ad643e80dbb6
generated_at: 2026-11-08T07:50:59.393897+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/delete-restore-audit.test.ts

## Purpose

Integration tests that verify the products service's `removeById` and `restoreById` methods emit the correct audit events (`ADMIN_PRODUCT_DELETED` / `ADMIN_PRODUCT_RESTORED`) from the service layer, with the expected action, outcome, target, and metadata fields. The tests pin the audit contract after the emit calls were moved out of the controller into the service (module-lifecycle rule 1).

## Key elements

- **`describe('removeById')`** — three cases: soft-delete audit (metadata `{ hardDelete: false }`), hard-delete audit (metadata `{ hardDelete: true }`), and no-context call (asserts no audit emit).
- **`describe('restoreById')`** — two cases: successful-restore audit, and no-context call (asserts no audit emit).
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the entire audit port with `auditPortMock()` from the test-support ports module (not a spy; see Notes).
- **`setupTestDb()`** — boots an in-memory DB for the integration run.
- **`observePort(auditPort.emitAuditEvent)`** — obtains a spy on the mocked port's `emitAuditEvent` for each test.
- **`callerContextAs('admin')`** — constructs a caller-context argument to pass to the service methods.

## Relationships

- **`src/modules/products/services/index.ts`** — imports `productService`, the system under test.
- **`src/modules/products/audit.ts`** — imports `productsAuditActions` for the expected action constants.
- **`src/infrastructure/observability/audit.ts`** — the port module that is fully mocked; its `emitAuditEvent` is the function under observation.
- **`tests/support/ports.ts`** — provides `auditPortMock()` (the factory used inside `jest.mock`) and `observePort()` (the per-test spy accessor).
- **`tests/support/callers.ts`** — provides `callerContextAs()` to build caller-context objects.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` for the in-memory database lifecycle.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct()` to seed a product row.

## Notes

- The audit port is **replaced**, not spied on. The inline comment explains that `jest.spyOn` cannot redefine the non-configurable getter exposed by a CommonJS namespace import; `jest.mock` with a full factory is the workaround. The referenced pattern lives in `orders/tests/integration/create-audit.test.ts`.
- "No context" tests (`removeById(id)` / `restoreById(id)` without a caller) assert the service emits **no** audit row at all — the audit step is conditional on a caller context being present.
- The file header references rule 1 in `docs/theory/module-lifecycle.md`: audit emission belongs in the service write path, not the controller.
