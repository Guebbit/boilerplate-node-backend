---
source: src/modules/delivery/services/split.ts
sha256: 747618fb5aeca51fdfc04538f24968b0cca917a445b07f8731c8662aa9389a2c
generated_at: 2026-10-29T03:44:38.674829+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/split.ts

## Purpose

Implements the *split* of a short-stock delivery: when partial stock arrives against a fulfillment order held `on_hold` for `awaiting_stock`, the allocated units are moved into a new `open` fulfillment order that can ship immediately, while the remainder stays held. If the arrival covers the entire remainder, the hold simply ends and no second order is created. Called exclusively by `releaseAllocated` inside the inventory-allocation transaction; no HTTP route reaches it directly.

## Key elements

- **`Split`** (exported interface) — return shape: `released` (the order free to ship) and optional `held` (the order still awaiting stock; absent when the allocation covered everything).
- **`withoutAllocated`** (internal) — subtracts allocated quantities from the held order's lines and drops lines whose quantity reaches zero.
- **`allocatedLines`** (internal) — builds the new order's lines from the allocated `ProductQuantity` list, copying titles from the held order.
- **`splitAct`** (internal) — performs the split inside a Mongoose session: validates status/hold-reason, verifies allocation via `checkShipLines`, then either claims the held order as fully released (full-coverage path) or claims it with reduced lines and creates a sibling order (partial path). Emits `reportProgress` and `announceReleased`.
- **`splitForAllocation`** (exported) — public entry point. Looks up the fulfillment order, checks the parent order isn't cancelled, wraps `splitAct` in `runAct`, and returns `Split | undefined`.

## Relationships

- **`../domain`** (`fulfillment.ts`, `index.ts`) — imports `checkShipLines`, `remainingOfLine`, `statusOfLines` for line validation and status derivation, and the `FulfillmentLine` / `ProductQuantity` types.
- **`../repository.ts`** — all persistence goes through `fulfillmentOrderRepository`: `findInSession`, `claim`, `create`, `findByOrderId`, `findById`.
- **`../model.ts`** — imports the `FulfillmentOrderDocument` type.
- **`./act.ts`** — imports `runAct`, `refuse`, `refuseMissing` for transactional execution and structured error returns.
- **`./announce.ts`** — imports `announceReleased` to emit the `fulfillment_order.released` event after the split commits.
- **`./progress.ts`** — imports `reportProgress` to update the order's progress indicator.
- **`./release-allocated.ts`** — the sole caller of `splitForAllocation`; this file never invokes it directly.
- **`@modules/orders`** — imports `orderService.getById` to confirm the parent order is not cancelled before splitting.
- **`@types`** — imports `FulfillmentHoldReason` and `FulfillmentOrderStatus` enums.
- **`./index.ts`** — re-exports this module as part of the delivery services barrel.
- **`tests/unit/fulfillment.test.ts`** — unit tests exercise the split logic.

## Notes

- The new order's `number` is derived as `max(siblings.number) + 1`; it shares the parent `orderId` so the admin can group related fulfillments.
- `sourceShipmentId` is copied to the new order when present, so a late-arriving parcel can still be linked to every line that remains owed.
- The `covers` shortcut avoids creating a redundant second order when the allocation fully satisfies the remainder — the held order is simply transitioned to its new status in place.
- `allocatedLines` falls back to an empty-string title if the product isn't found on the held order's lines (defensive; should not occur after `checkShipLines` passes).
- The function is intentionally non-HTTP: it runs inside the caller's `ClientSession` transaction, so a failure here rolls back the inventory allocation atomically.
