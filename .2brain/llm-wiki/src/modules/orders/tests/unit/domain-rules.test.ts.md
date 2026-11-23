---
source: src/modules/orders/tests/unit/domain-rules.test.ts
source_sha256: facb8cce19371280751483727d040d466b094c7bdb5a6f94bab9bae7f5b739f8
context_sha256: 601915787ab039b268c9e25a5624f3be4848611e8ac004bee4f9524733895306
generated_at: 2026-11-22T06:35:19.949851+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/domain-rules.test.ts

## Purpose
Unit tests for the pure order rules in `src/modules/orders/domain/rules.ts`. The tests use no mocks, database, or fake timers. Each rule takes arguments and returns a verdict, so tests call the functions directly and assert on the results.

## Key elements
- `line(quantity = 1)`: local helper that builds an `OrderLineCandidate` with a resolved product (`price: '10.00'`).
- `checkOrderLines` tests:
  - An empty set returns `{ ok: false, reason: 'no-lines' }`.
  - Lines whose products all resolved return `{ ok: true }`.
  - A line whose product is `undefined` or `null` makes the whole set fail with `reason: 'product-missing'`, even if the other lines are fine.
- `isShippedItem` tests:
  - A product with `requiresShipping` omitted, or set to `true`, counts as shipped.
  - `requiresShipping: false` counts as digital, so it is not shipped.
  - A missing product (`null`, or no `product` key) counts as shipped.
- `isDigitalOnlyOrder` tests:
  - An empty order returns `false`.
  - Returns `true` only if every line is digital.
  - Returns `false` if any line needs shipping.
- `buyerIdOf` and `isBuyer` tests:
  - `buyerIdOf` returns the string form of `userId` (via `toString()`). It returns `undefined` when `userId` is `undefined` or `null`.
  - `isBuyer` matches the order's `userId` to the caller's `id`. It returns `false` for a different id, a `null` or `undefined` caller id, an undefined caller, or an erased buyer (`userId: undefined`).

## Relationships
- Imports `buyerIdOf`, `checkOrderLines`, `isBuyer`, `isShippedItem`, `isDigitalOnlyOrder` and the `OrderLineCandidate` type from `src/modules/orders/domain/rules.ts`. That is the only module under test.

## Notes
- `product-missing` and `no-lines` are separate reasons because they map to different status codes, so the tests keep them distinct.
- A missing product is never dropped from an order. The order embeds a snapshot, so one unresolved line fails the whole set.
- Treating an unresolved product as shipped is described in the test as "the safe direction".
- The soft delete and read scope are deliberately not tested here. The file says they are one-line expressions with one caller each, so they live in the service layer (`../../services/crud` and `../../services/scope`), which includes the fail-closed scope cases.
