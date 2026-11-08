---
source: src/modules/orders/tests/integration/order-number-filter.test.ts
sha256: 6cc943152076d82448bd743cac9d1b9a4c7a6a36e812bb9e0ed87add576590c5
generated_at: 2026-11-08T07:06:38.775228+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-number-filter.test.ts

## Purpose

Integration tests (against a real MongoDB) that verify the `orderNumber` filter behaves correctly across search and CSV export: it tolerates common typos and formatting variants, returns an empty page (not an error) for values that cannot be valid order numbers, respects the caller's read scope, and enforces uniqueness via a database index.

## Key elements

- **`orderNumbered(orderNumber, email)`** — helper that creates a user, a product, and an order pinned to the given `orderNumber`; returns `{ user, id }`.
- **`found(orderNumber)`** — helper that calls `orderService.search` with the number and returns only the resulting item ids.
- **`describe('the orderNumber filter')`** — parameterised cases for format tolerance (`#`, leading/trailing spaces, abbreviated year), empty-result guards, scope enforcement (a buyer cannot see another buyer's order), and CSV export filtering.
- **`describe('the unique index')`** — confirms that a second order with an already-issued number is rejected with Mongo duplicate-key error `11000` after `orderModel.init()`.

## Relationships

- **`src/modules/orders/services/index.ts`** — provides `orderService` (`search`, `callerScope`, `openOrderExport`), the unit under test.
- **`src/modules/orders/model.ts`** — provides `orderModel`; its `init()` call materialises the unique index exercised in the last test.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` build the order fixtures.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the line-item product.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates the buyer accounts.
- **`tests/support/callers.ts`** — `asAdmin`, `asCustomer`, `callerContextAs` build the auth/scope contexts passed to service calls.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top-level to provision a real Mongo instance for the suite.

## Notes

- The test uses **real MongoDB** (no service mocks); `setupTestDb()` runs once per module load.
- The CSV export assertion reads the stream with `text()` from `node:stream/consumers` and checks content inclusion/exclusion rather than parsing rows.
- The scope test calls `orderService.callerScope(asCustomer(...))` explicitly to obtain a restricted scope, then verifies that searching another buyer's number yields zero items.
- The unique-index test depends on `orderModel.init()` being called before the second insert; without it the index may not yet exist.
