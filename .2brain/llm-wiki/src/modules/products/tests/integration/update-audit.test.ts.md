---
source: src/modules/products/tests/integration/update-audit.test.ts
sha256: 3249ce961ca27da88251359ca15e1ce42154087fcab2ac35ec046c2f68b989f5
generated_at: 2026-11-08T07:53:24.709779+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/update-audit.test.ts

## Purpose

Integration test that verifies the `ADMIN_PRODUCT_UPDATED` audit event records every non-text field an update actually moved as a `{ from, to }` pair (or one-sided when the field was unset/cleared), while free-text fields (title) appear only by name. The goal is to ensure an auditor can reconstruct a "lower, sell, restore" sequence from the audit trail alone.

## Key elements

- **`updatedRowMetadata(spy)`** — helper that pulls the `metadata` object from the single `ADMIN_PRODUCT_UPDATED` entry in the mocked audit port's call history.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit port entirely with the port-based mock from `tests/support/ports.ts` (not a spy on the real module).
- **`setupTestDb()`** — initialises a real database so `productService.updateById` writes genuine rows.
- **`describe('productService.updateById — the audit row of a money edit')`** — five cases covering:
  - `{ from, to }` for price / taxClass / rateType changes.
  - One-sided entries when a field is cleared (`from` only) or newly set (`to` only).
  - Rights / shipping / publishing / weight / sku / categories changes.
  - `releaseDate` normalised via `startOfShopDay`; title recorded by name in `changedFields`, value never copied.
  - Unchanged fields and a title-only rename produce no `changes` entries, only `changedFields: ['title']`.

## Relationships

- **`src/modules/products/services/index.ts`** — source of `productService.updateById`, the method under test.
- **`src/modules/products/audit.ts`** — provides the `productsAuditActions.ADMIN_PRODUCT_UPDATED` action constant used in assertions.
- **`src/infrastructure/observability/audit.ts`** — the audit port module; fully replaced by the mock at import time.
- **`src/modules/products/tests/factories.ts`** — `createProduct` factory that seeds a product with known field values before each update.
- **`src/modules/shop/index.ts`** — exports `startOfShopDay`, used to normalise the expected `releaseDate` ISO string in one assertion.
- **`tests/support/ports.ts`** — supplies `observePort` (spies a port function) and `auditPortMock` (the replacement used by `jest.mock`).
- **`tests/support/callers.ts`** — `callerContextAs('admin')` builds the authenticated caller context passed to `updateById`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database.
- **`src/modules/shop/service.ts`** — reachable through the shop module's barrel; `startOfShopDay` is its re-exported utility.

## Notes

- The audit port is **replaced**, not spied on. The `observePort` helper then wraps the mock so individual assertions can inspect calls. `afterEach` calls `jest.restoreAllMocks()` to reset.
- Free-text fields (e.g. `title`) must **never** appear in the audit metadata's `changes` object—only their field name goes into `changedFields`. One test explicitly asserts `JSON.stringify(metadata)` does not contain the new title.
- `releaseDate` in the assertion is run through `startOfShopDay('2031-01-01').toISOString()`, implying the service normalises dates to the shop's local-day boundary before persisting.
- `tags: ['red']` is sent unchanged in one test and correctly does **not** appear in the `changes` output, confirming equality filtering.
