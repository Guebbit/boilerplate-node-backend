---
source: src/modules/orders/tests/integration/order-number-filter.test.ts
source_sha256: 6cc943152076d82448bd743cac9d1b9a4c7a6a36e812bb9e0ed87add576590c5
context_sha256: 9bd0d95ec0763b989729ec0981b8902706194e26ab12d10747a0f08eb68218b8
generated_at: 2026-11-22T06:30:15.182990+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/order-number-filter.test.ts

## Purpose
Integration tests, run against a real Mongo instance, for the `orderNumber` filter on the order list, search and CSV export. They cover how the number is matched (exact, tolerant of how a customer types it), what happens for values that can't be order numbers, how the caller's read scope bounds results, and the unique index on order numbers.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `orderNumbered(orderNumber, email)`: helper that creates a user (username derived from the email by stripping non-word characters), a product, and an order with the pinned number. It returns `{ user, id }`.
- `found(orderNumber)`: helper that calls `orderService.search({ orderNumber }, {})` and returns the matching order ids.
- `describe('the orderNumber filter')`:
  - Typed variants (`'1999-000041'`, `'#1999-000041'`, `' 1999-41 '`, `'#1999-41'`) all find the one order numbered `1999-000041`.
  - `'nonsense'`, `'41'`, `'1999-` and `'#'` return an empty page, not an error.
  - A well-formed number that nobody holds (`1999-99`) returns nothing.
  - Scope: a buyer using `orderService.callerScope(asCustomer(...))` finds their own order by number but not another buyer's.
  - CSV export: `orderService.openOrderExport` with `'#1999-42'` as admin produces a file containing `1999-000042` and not `1999-000041`.
- `describe('the unique index')`: after `orderModel.init()`, creating a second order with an already-issued number rejects with Mongo duplicate-key code `11_000`.

## Relationships
- `src/modules/orders/services/index.ts`: supplies `orderService` (`search`, `callerScope`, `openOrderExport`), the code under test.
- `src/modules/orders/model.ts`: supplies `orderModel`. The test calls `init()` on it so the unique index is built before the duplicate-insert check.
- `src/modules/orders/tests/factories.ts`: supplies `createOrder` and `toOrderItem`.
- `src/modules/products/tests/factories.ts`: supplies `createProduct`.
- `src/modules/users/tests/factories.ts`: supplies `createUser`.
- `tests/support/callers.ts`: supplies `asAdmin`, `asCustomer` and `callerContextAs`, which build the caller identities and contexts.
- `tests/support/setup-test-db.ts`: supplies `setupTestDb`.

## Notes
- Matching is by short form: `1999-41` matches the stored `1999-000041`, so the tests pin a zero-padded stored number and type shorter forms.
- A bare `41` or `1999-` is treated as not being an order number and gives an empty result.
- `openOrderExport` returns an object with a `success` key when it refuses. The test throws in that case, otherwise it reads `source.pipe(csv)` as text.
- The unique-index test needs `orderModel.init()` first, because the index may not exist yet.
