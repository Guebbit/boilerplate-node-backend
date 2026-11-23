---
source: src/modules/products/tests/integration/delete-restore-audit.test.ts
source_sha256: 5b8214586a7ee5b48742dde87dd93659f8ae35a690b3deda193af44c16cdbe83
context_sha256: 063d08a0a9bf997d47741f3b0b22fa542e97278032346691d074d79bead23288
generated_at: 2026-11-22T07:16:06.993823+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/delete-restore-audit.test.ts

## Purpose
Integration tests pinning that `productService.removeById` and `productService.restoreById` emit the correct audit events (`ADMIN_PRODUCT_DELETED` / `ADMIN_PRODUCT_RESTORED`) through the audit port. The service writes these audit rows itself, consistent with every other module's write path.

## Key elements
- `jest.mock('@infrastructure/observability/audit', ...)`: replaces the audit port module with `auditPortMock()` from `@tests/ports` (loaded via `jest.requireActual`).
- `setupTestDb()`: sets up the test database for the suite.
- `afterEach(() => jest.restoreAllMocks())`: restores mocks after each test.
- `describe('removeById')`:
  - Soft delete (`removeById(id, false, admin)`) emits `ADMIN_PRODUCT_DELETED` with `metadata: { hardDelete: false }`.
  - Hard delete (`removeById(id, true, admin)`) emits `ADMIN_PRODUCT_DELETED` with `metadata: { hardDelete: true }`.
- `describe('restoreById')`: after soft-deleting a product, `restoreById(id, admin)` emits `ADMIN_PRODUCT_RESTORED`.
- All assertions use `expect.objectContaining` with `outcome: 'success'`, `targetType: 'product'`, and `targetId` equal to the stringified product `_id`.

## Relationships
- `src/infrastructure/observability/audit.ts`: the audit port whose `emitAuditEvent` is mocked and observed.
- `src/modules/products/audit.ts`: supplies `productsAuditActions` constants used for the expected `action` values.
- `src/modules/products/services/index.ts`: provides `productService`, the code under test.
- `src/modules/products/tests/factories.ts`: `createProduct()` creates fixture products.
- `tests/support/callers.ts`: `callerContextAs('admin')` builds the admin caller context.
- `tests/support/ports.ts`: provides `auditPortMock()` and `observePort()` (wraps `emitAuditEvent` to get a spy).
- `tests/support/setup-test-db.ts`: provides `setupTestDb`.

## Notes
- The audit port is replaced via `jest.mock` rather than `jest.spyOn`, because `spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes. Full reasoning is referenced in `src/modules/orders/tests/integration/create-audit.test.ts`.
- In the restore test, the preliminary `removeById(id)` is called without a caller context.
