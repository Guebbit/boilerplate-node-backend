---
source: src/modules/orders/tests/unit/status-traits.test.ts
source_sha256: 70942ff6f8deb1eded5c34451579ce8d5b1fc08d093ffaf6ae7b81f7234d7880
context_sha256: ce24f4eaa20142c178a0bb9ebb8a65c1889900e16dfaf09f05c4e54d635e1458
generated_at: 2026-11-22T06:38:28.922119+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/status-traits.test.ts

## Purpose
Unit tests for the order status-traits record (`ORDER_STATUS_TRAITS`) and the `statusesWhere` helper. They check that the record covers every `OrderStatus` and that each status carries the expected trait flags.

## Key elements
- **`ORDER_STATUS_TRAITS` completeness test**: asserts the record's sorted keys equal the sorted values of the `OrderStatus` enum, so there is exactly one row per status.
- **Per-status `it.each` table**: checks `stockCommitted`, `beforeDispatch` and `withdrawable` for each status using `toMatchObject`:

  | Status | stockCommitted | beforeDispatch | withdrawable |
  |---|---|---|---|
  | `pending` | false | true | true |
  | `paid` | true | true | true |
  | `processing` | true | true | true |
  | `shipped` | true | false | true |
  | `delivered` | true | false | true |
  | `canceled` | false | false | false |

- **`statusesWhere` test**: with the predicate `traits.fulfillment.followsSummary`, expects `[paid, processing]`, in contract order.

## Relationships
- Imports `ORDER_STATUS_TRAITS` and `statusesWhere` from `../../domain` (`src/modules/orders/domain/index.ts`). That file re-exports them from `status-traits.ts`, where they are defined.
- Imports `OrderStatus` from `@types` (`src/types/index.ts`). The enum is the "contract" the record is compared against.

## Notes
- Tests use `toSorted()`, so they need a runtime that supports it (Node 20+).
- `toMatchObject` means the table checks only three flags. Other trait fields, such as `fulfillment.followsSummary`, are exercised only by the `statusesWhere` test.
- The expected `statusesWhere` order comes from the contract order of the statuses, not from alphabetical order.
