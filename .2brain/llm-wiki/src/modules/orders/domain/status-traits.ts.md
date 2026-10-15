---
source: src/modules/orders/domain/status-traits.ts
sha256: b55340dd0e64c63fcdb88075f1078aafe842d350e45873a71a7844687e9bc4fe
generated_at: 2026-10-15T11:02:35.687734+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/status-traits.ts

## Purpose

Declares, in a single record, what every `OrderStatus` means with respect to stock commitment, dispatch state, buyer withdrawability, and current fulfillment. Other domain files (lifecycle, withdrawal, fulfillment) read these traits to answer status-dependent questions instead of maintaining their own status lists. The `satisfies Record<OrderStatus, …>` annotation makes the mapping exhaustive: adding a new status to the contract breaks the build here rather than silently falling into a wrong category.

## Key elements

- **`OrderStatusTraits`** (interface) — the shape of one status's traits: `stockCommitted`, `beforeDispatch`, `withdrawable`, and a `fulfillment` sub-object (`value: OrderFulfillmentStatus` + `followsSummary: boolean`).
- **`ORDER_STATUS_TRAITS`** (const) — the concrete trait record for all six statuses (`pending`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`), annotated with `as const satisfies Record<OrderStatus, OrderStatusTraits>`.
- **`statusesWhere(test)`** (function) — returns the list of statuses (in `OrderStatus` enum order) whose traits pass the given predicate.

## Relationships

- **`src/types/index.ts`** — imports `OrderStatus` and `OrderFulfillmentStatus`; this file's record is typed against those contracts.
- **`src/modules/orders/domain/withdrawal.ts`** — reads `withdrawable` from `ORDER_STATUS_TRAITS` to decide whether a buyer may exercise withdrawal.
- **`src/modules/orders/domain/fulfillment.ts`** — consumes the `fulfillment.value` / `fulfillment.followsSummary` fields to derive or refine the displayed fulfillment state.
- **`src/modules/orders/domain/lifecycle.ts`** — queries traits (e.g. `stockCommitted`, `beforeDispatch`) when validating or selecting permitted transitions.
- **`src/modules/orders/domain/index.ts`** — re-exports `OrderStatusTraits`, `ORDER_STATUS_TRAITS`, and `statusesWhere` as part of the module's public API.
- **`src/modules/orders/tests/unit/status-traits.test.ts`** — unit-tests the trait values and the `statusesWhere` helper.

## Notes

- `withdrawable` is `true` for `pending` intentionally: the buyer's right of withdrawal does not depend on their own payment (CRD Art. 9).
- `followsSummary` distinguishes statuses where `delivery`'s summary can override the base fulfillment value (e.g. `paid`, `processing`) from those where it cannot (`pending`, `shipped`, `delivered`, `cancelled`).
- The file is a pure data declaration plus one small query helper; it holds no business logic beyond the trait values themselves.
- See `docs/modules/orders.md#status-traits` for the prose specification behind the trait choices.
