---
source: src/modules/orders/tests/unit/projections.test.ts
source_sha256: 9d047912a0b15f2101506e19ae1f1fde8464b52ba8e3a7362a854f3d6d7c8d98
context_sha256: 418419d1939fdf489c279ad325c850508404b90e31fea8f1c0029648978e1905
generated_at: 2026-11-22T06:37:09.197970+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/projections.test.ts

## Purpose
Unit tests for the two "sibling" status projections stamped beside an order's own status: the payment status and the return status. Each is derived from what its owner stamped on the order. The fulfillment status is not covered here. Per the module header, it reads the summary `delivery` reports and is tested elsewhere.

## Key elements
- `describe('paymentStatusOf')` tests `paymentStatusOf(stamped, paidAt)`:
  - `undefined, undefined` gives `'unpaid'`.
  - `undefined` with a `paidAt` date gives `'paid'`.
  - A stamped `'partially_refunded'` or `'refunded'` wins over `paidAt`. This is a parameterized `it.each` case.
- `describe('returnStatusOf')` tests `returnStatusOf(stamped)`:
  - `undefined` gives `'none'`.
  - A stamped value, e.g. `'partially_returned'`, is returned unchanged.

## Relationships
- Imports `paymentStatusOf` and `returnStatusOf` from `src/modules/orders/domain/index.ts`, the domain barrel.
- The functions themselves are presumably defined in `src/modules/orders/domain/projections.ts`, which is the module under test. The test does not import that file directly.

## Notes
- Tests are pure and need no fixtures or mocks. The only fixture is a fixed `paidAt` date, `2026-03-01T00:00:00Z`.
- Refund stamps take precedence over `paidAt`. `paidAt` only distinguishes `'paid'` from `'unpaid'` when nothing is stamped.
