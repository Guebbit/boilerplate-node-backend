---
source: src/modules/products/tests/integration/delete-restore-audit.test.ts
sha256: 65245898f142de4e4351c635eb5e569327b1adf662e47ac8496229c2075e6421
generated_at: 2026-11-14T21:31:08.022051+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/delete-restore-audit.test.ts

## Purpose

Integration tests that pin the audit events emitted by `productService.removeById` and `productService.restoreById` after the audit logic was relocated from the delete/restore controllers into the service layer. They verify that `ADMIN_PRODUCT_DELETED` (with `metadata.hardDelete` reflecting soft vs. hard) and `ADMIN_PRODUCT_RESTORED` still land with the correct action, outcome, target, and metadata.

## Key elements

- **`jest.mock` factory** — replaces the `@infrastructure/observability/audit` module with `auditPortMock()` from `@tests/ports` rather than using `jest.spyOn` (CJS namespace getters are non-configurable).
- **`describe('removeById')`** — two cases: soft delete asserts `metadata: { hardDelete: false }`; hard delete asserts `metadata: { hardDelete: true }`. Both expect `action: ADMIN_PRODUCT_DELETED`, `outcome: 'success'`, `targetType: 'product'`.
- **`describe('restoreById')`** — one case: deletes then restores, asserting `action: ADMIN_PRODUCT_RESTORED` with the same shape (no `metadata` check).
- **`setupTestDb()`** — one-time database reset before the suite.
- **`afterEach(jest.restoreAllMocks)`** — teardown between tests.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/products/services/index.ts` | Exports `productService`; the `removeById` / `restoreById` methods under test. |
| `src/modules/products/audit.ts` | Exports `productsAuditActions` enum used in every assertion. |
| `src/infrastructure/observability/audit.ts` | The audit port module whose `emitAuditEvent` is observed; the real implementation is bypassed by the mock. |
| `tests/support/ports.ts` | Provides `observePort` (returns a spy on the port method) and `auditPortMock()` (supplied to the mock factory). |
| `tests/support/callers.ts` | Provides `callerContextAs('admin')` to construct the caller context passed to each service call. |
| `src/modules/products/tests/factories.ts` | Provides `createProduct()` to seed a known product in the test DB. |
| `tests/support/setup-test-db.ts` | Provides `setupTestDb()` for DB lifecycle. |

## Notes

- **Port replacement, not spying.** The mock uses a `jest.mock` factory that returns `auditPortMock()`. This is intentional: `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS `import * as` namespace exposes. The same pattern and full reasoning live in `orders/tests/integration/create-audit.test.ts`.
- **Design rule reference.** The module docblock cites *rule 1* of `docs/theory/module-lifecycle.md`: audit emission belongs in the service write path, not the controller. These tests exist to prevent regression of that move.
- **Caller context.** All calls use `callerContextAs('admin')`; the tests do not exercise non-admin callers.
