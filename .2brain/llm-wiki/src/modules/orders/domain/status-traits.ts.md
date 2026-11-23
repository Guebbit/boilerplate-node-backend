---
source: src/modules/orders/domain/status-traits.ts
source_sha256: 2aa837f4621207c7aa459d02120e0725d3e4a51a5dfa8b0a5bdfbb8e81391d0a
context_sha256: 8608742dbcd7d3114ff50c51c8da7b392a7e52eabf993ecc824cc687589d5b39
generated_at: 2026-11-22T06:13:00.332854+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/status-traits.ts

## Purpose
Single declaration of what each order status means. Any question the orders module asks of a status alone (is stock committed, may the buyer withdraw, where do the goods stand) reads this record instead of keeping its own status lists. The record is total over `OrderStatus`, so adding a status to the contract breaks the build here instead of silently landing in a wrong category.

## Key elements
- `OrderStatusTraits` (interface): per-status traits, all readonly:
  - `stockCommitted`: the stock hold is `committed` or later (payment settled, not given up).
  - `beforeDispatch`: nothing has left the shop yet, so a withdrawal is a cancel rather than a return.
  - `withdrawable`: the consumer's right of withdrawal may be exercised from this status.
  - `fulfillment`: `{ value: OrderFulfillmentStatus, followsSummary: boolean }`. `value` is where the goods stand. `followsSummary` says whether `delivery`'s summary may refine it (partially fulfilled, on hold).
- `ORDER_STATUS_TRAITS`: the `as const satisfies Record<OrderStatus, OrderStatusTraits>` table.
- `statusesWhere(test)`: returns the `OrderStatus` values, in contract order (`Object.values(OrderStatus)`), whose traits satisfy the predicate.

## Table summary
| status | stockCommitted | beforeDispatch | withdrawable | fulfillment (followsSummary) |
|---|---|---|---|---|
| pending | no | yes | yes | unfulfilled (no) |
| paid | yes | yes | yes | unfulfilled (yes) |
| processing | yes | yes | yes | in_progress (yes) |
| shipped | yes | no | yes | shipped (no) |
| delivered | yes | no | yes | fulfilled (no) |
| canceled | no | no | no | unfulfilled (no) |

## Relationships
- Imports `OrderStatus` (runtime value, iterated by `statusesWhere`) and the type `OrderFulfillmentStatus` from `@types` (`src/types/index.ts`).
- The sibling domain files `src/modules/orders/domain/fulfillment.ts`, `src/modules/orders/domain/lifecycle.ts` and `src/modules/orders/domain/withdrawal.ts` are its neighbors in the dependency graph. By the module's stated design they read the traits instead of listing statuses themselves. This matches the `fulfillment`, `stockCommitted` and `withdrawable`/`beforeDispatch` fields, but the file does not name its consumers.
- `src/modules/orders/domain/index.ts` is a neighbor in the graph.
- `src/modules/orders/tests/unit/status-traits.test.ts` is the unit test for this file.

## Notes
- `pending` is `withdrawable` on purpose: the buyer's right does not wait for their own payment (CRD Art. 9). `withdrawable` means "contract concluded, not canceled".
- `followsSummary` is `true` only for `paid` and `processing`.
- `statusesWhere` order follows the `OrderStatus` contract order, not the order of keys in the table.
