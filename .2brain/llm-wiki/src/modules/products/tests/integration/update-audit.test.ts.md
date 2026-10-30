---
source: src/modules/products/tests/integration/update-audit.test.ts
sha256: a5ea3de12ff92dfccd4269848d5deef39dc1070a14a668ab761cbe28c119f50e
generated_at: 2026-10-29T05:34:21.179269+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/update-audit.test.ts

## Purpose

Integration tests that verify the `ADMIN_PRODUCT_UPDATED` audit event emitted by `productService.updateById` records every non-text field that actually changed as `{ from, to }`, and that free-text / picture fields appear only by name. The goal is a self-sufficient audit trail: a "lower price, change VAT, restore" story must be readable from the audit row alone, without reconstructing it from frozen order lines.

## Key elements

- **`updatedRowMetadata(spy)`** – helper that pulls the `metadata` object from the single `ADMIN_PRODUCT_UPDATED` call captured on the audit-port spy.
- **`describe` block: "productService.updateById — the audit row of a money edit"** – five test cases covering:
  1. *price / taxClass / rateType* all record `from` and `to`.
  2. Clearing a field records only `from`; setting a previously-unset field records only `to`.
  3. Rights, shipping, publishing, `sku`, and `categories` fields record `from`/`to`; `weight` cleared records only `from`; unchanged `tags` are omitted.
  4. `releaseDate` records `to`; a changed `title` appears in `changedFields` by name only (value is **not** stored).
  5. Sending a value unchanged writes no entry; a title rename appears solely in `changedFields`.

## Relationships

| Neighbor | Role |
|---|---|
| `src/infrastructure/observability/audit.ts` | The audit port module; fully **mocked** (not spied) via `jest.mock` + `auditPortMock()`. |
| `src/modules/products/audit.ts` | Exports `productsAuditActions.ADMIN_PRODUCT_UPDATED`, used to identify the correct row. |
| `src/modules/products/services/index.ts` | Provides `productService.updateById`, the system under test. |
| `src/modules/products/tests/factories.ts` | Provides `createProduct` to seed a product before each update. |
| `tests/support/ports.ts` | Supplies `auditPortMock()` (mock factory) and `observePort` (spies on the mocked port). |
| `tests/support/callers.ts` | Supplies `callerContextAs('admin')` to build the caller context argument. |
| `tests/support/setup-test-db.ts` | Supplies `setupTestDb()` for an in-memory test database. |

## Notes

- The audit port is **replaced**, not spied on (see the comment referencing `delete-restore-audit.test.ts`). `observePort` wraps the already-mocked module to capture calls.
- Free-text fields (`title`, descriptions) and pictures are recorded **by name only** in `changedFields`; the test explicitly asserts the title value never appears in the serialized metadata (`JSON.stringify(metadata)` check).
- Unchanged fields (e.g. `price` sent back at the same value, `tags` left identical) produce **no** entry in `changes` — the audit row is minimal, not a full before/after snapshot.
- `afterEach` calls `jest.restoreAllMocks()` to reset the port between tests.
