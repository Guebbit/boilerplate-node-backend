---
source: src/modules/orders/domain/status-traits.ts
sha256: 1725548502e76563d593d1ff4649b9c19cfcd32119e47abc7f8c064726558847
generated_at: 2026-11-08T06:50:05.373979+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/status-traits.ts

## Purpose

Single source of truth for what each `OrderStatus` means in isolation. Every question the orders module asks of a status alone—stock commitment, dispatch state, withdrawal eligibility, fulfillment position—is answered by reading this one record instead of each consumer maintaining its own status list. Exhaustiveness is enforced at compile time via `satisfies Record<OrderStatus, OrderStatusTraits>`, so a new status in the contract fails the build here rather than silently falling into a wrong category.

## Key elements

- **`OrderStatusTraits`** (interface) — Shape of per-status traits: `stockCommitted`, `beforeDispatch`, `withdrawable`, and a nested `fulfillment` object (`value: OrderFulfillmentStatus` + `followsSummary: boolean` indicating whether the delivery summary may refine the status, e.g. partial fulfillment or on-hold).
- **`ORDER_STATUS_TRAITS`** (const, `as const satisfies …`) — The complete traits record for all six statuses (`pending`, `paid`, `processing`, `shipped`, `delivered`, `canceled`). Immutable; the only place these booleans are declared.
- **`statusesWhere(test)`** — Returns an array of `OrderStatus` values (in contract order) whose traits pass the given predicate. Convenience for callers that need "all statuses where X is true" without iterating the object themselves.

## Relationships

- **`src/types/index.ts`** — Provides `OrderStatus` and `OrderFulfillmentStatus`; both are imported here and shape the traits contract.
- **`src/modules/orders/domain/lifecycle.ts`** — Consumes `ORDER_STATUS_TRAITS` / `statusesWhere` to gate state transitions (e.g. which transitions are legal depends on `stockCommitted`, `beforeDispatch`).
- **`src/modules/orders/domain/withdrawal.ts`** — Reads the `withdrawable` trait to decide whether a buyer may exercise the right of withdrawal from a given status.
- **`src/modules/orders/domain/fulfillment.ts`** — Reads the `fulfillment` sub-object; `followsSummary` tells it whether the live delivery summary can override the static status value.
- **`src/modules/orders/domain/index.ts`** — Barrel re-export; external consumers of the orders domain import traits through this file.
- **`src/modules/orders/tests/unit/status-traits.test.ts`** — Unit tests verifying the traits table is complete and each field is set as expected.

## Notes

- `withdrawable` is `true` for `pending` as well as `paid`/`processing`/`shipped`/`delivered`. This is intentional: the consumer's right of withdrawal (CRD Art. 9) does not wait for the buyer's own payment to complete.
- `followsSummary` is `true` only for `paid` and `processing`. In those states the delivery summary (e.g. "partially fulfilled", "on hold") is allowed to refine the static fulfillment value; for every other status the static value is authoritative.
- The record uses `as const`, so downstream code gets literal types (e.g. `'unfulfilled'` rather than `OrderFulfillmentStatus`) when indexing a specific status.
- `statusesWhere` iterates `Object.values(OrderStatus)` (the enum/union at runtime), not the keys of `ORDER_STATUS_TRAITS`—the two stay in lockstep only because `satisfies` guarantees the record is total.
