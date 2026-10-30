---
source: src/modules/products/tests/integration/delete-restore-audit.test.ts
sha256: e978525e97754d3975ac717651d961372fab4542510b1ba24a60ad643e80dbb6
generated_at: 2026-10-29T05:32:09.647409+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/delete-restore-audit.test.ts

## Purpose

Integration tests that pin the audit-emission contract of `productService.removeById` and `productService.restoreById` after the audit logic was relocated from the delete/restore controllers into the service layer. They verify that `ADMIN_PRODUCT_DELETED` and `ADMIN_PRODUCT_RESTORED` events still land with the expected fields, and that no event is emitted when no caller context is supplied.

## Key elements

- **`describe('removeById')`** — three tests: soft-delete audit (`hardDelete:false`), hard-delete audit (`hardDelete:true`), and the no-context no-op case.
- **`describe('restoreById')`** — two tests: successful restore audit and the no-context no-op case.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the entire audit module with `auditPortMock()` from `tests/support/ports` rather than spying.
- **`observePort(auditPort.emitAuditEvent)`** — creates a per-test spy on the mocked port's `emitAuditEvent` function.
- **`callerContextAs('admin')`** — supplies an admin caller context; omitting it exercises the no-audit path.
- **`productsAuditActions`** — action-name constants (`ADMIN_PRODUCT_DELETED`, `ADMIN_PRODUCT_RESTORED`) imported from the products audit module.

## Relationships

- **`src/modules/products/services/index.ts`** — source of `productService`, the unit under test.
- **`src/modules/products/audit.ts`** — exports `productsAuditActions` (the action constants asserted in expectations).
- **`src/infrastructure/observability/audit.ts`** — the real audit port; fully mocked out at module level so no actual persistence or side-effect occurs.
- **`tests/support/ports.ts`** — provides `auditPortMock()` (the mock implementation) and `observePort()` (the spy factory).
- **`tests/support/callers.ts`** — provides `callerContextAs` to fabricate an admin caller.
- **`tests/support/setup-test-db.ts`** — initialises the in-memory test database before all tests.
- **`src/modules/products/tests/factories.ts`** — `createProduct` factory used to seed a product row per test.

## Notes

- The audit module is **replaced** (`jest.mock` + factory), not spied on (`jest.spyOn`). The inline comment explains why: a CommonJS namespace import exposes a non-configurable getter that `jest.spyOn` cannot redefine. See `orders/tests/integration/create-audit.test.ts` for the fuller rationale.
- When no caller context is passed, the service must emit **no** audit event at all — this is an intentional contract, not an edge case.
- The file header references `docs/theory/module-lifecycle.md` (rule 1) as the architectural justification for auditing living in the service layer rather than the controller.
