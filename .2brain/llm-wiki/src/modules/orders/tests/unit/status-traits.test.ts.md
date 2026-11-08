---
source: src/modules/orders/tests/unit/status-traits.test.ts
sha256: a1c043e9271d556d3c4786394d8a1dca24e5b0dd5c85877807881ef99d17638e
generated_at: 2026-11-08T07:14:35.340691+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/status-traits.test.ts

## Purpose

Unit tests that lock down the `ORDER_STATUS_TRAITS` record and the `statusesWhere` predicate helper from the orders domain. They guarantee the traits table is a complete, correct mapping of every `OrderStatus` value and that `statusesWhere` filters statuses by a trait predicate in the expected contract order.

## Key elements

- **`describe('ORDER_STATUS_TRAITS')`**
  - *`has exactly one row per contract status`* — asserts the record's keys are the same set as `Object.values(OrderStatus)` (order-independent via `.toSorted()`).
  - *`it.each` table* — verifies `stockCommitted`, `beforeDispatch`, and `withdrawable` for each of the six statuses (`pending`, `paid`, `processing`, `shipped`, `delivered`, `canceled`).

- **`describe('statusesWhere')`**
  - *`lists matching statuses in contract order`* — calls `statusesWhere(t => t.fulfillment.followsSummary)` and expects `[paid, processing]`, confirming both filtering and enumeration order.

## Relationships

- **`src/modules/orders/domain/status-traits.ts`** — source of truth for `ORDER_STATUS_TRAITS` and `statusesWhere`; this file asserts their observable behavior.
- **`src/modules/orders/domain/index.ts`** — barrel re-export consumed by the import path `../../domain`; the test does not import the trait module directly.
- **`src/types/index.ts`** — provides the `OrderStatus` enum used to enumerate expected keys and to type the `it.each` table.

## Notes

- The `statusesWhere` test references `traits.fulfillment.followsSummary`, a nested property not covered by the explicit `it.each` table. If that trait's shape changes, only this test will catch the mismatch.
- Key-completeness uses `.toSorted()` on both sides, so the test is intentionally order-insensitive for the record keys but order-sensitive for `statusesWhere` output.
- The file is marked `@module` in its JSDoc; it has no runtime exports of its own.
