---
source: src/modules/delivery/services/split.ts
sha256: 85e787e7044abe151c283911b03fe6cb2299ce6ab53fceb2af7bcab961301c5e
generated_at: 2026-11-08T05:40:35.300699+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/split.ts

## Purpose

Implements the short-stock split: when a preorder fulfillment order is held for `awaiting_stock` and only partial inventory arrives, this file moves the arrived units into a new `open` fulfillment order (ready to ship) while the remainder stays on hold. If the arrival covers everything, the hold simply ends without creating a second order. It is invoked exclusively by `releaseAllocated` when `inventory` allocates stock to a paid preorder; no HTTP route reaches it directly.

## Key elements

- **`Split` (interface)** — Result type. `released` is the order that may ship now; `held` (optional) is the order still waiting. When `held` is absent, the allocation covered the full remainder.
- **`splitForAllocation` (export)** — Public entry point. Looks up the fulfillment order, verifies the parent order isn't canceled, then delegates to `splitAct` inside a transaction via `runAct`. Returns `Split | undefined`; all failure paths resolve to `undefined` rather than throwing.
- **`splitAct` (private)** — Core transactional logic. Validates status/hold-reason, checks the allocation against remaining lines, then either (a) releases the existing order in place (full coverage) or (b) shrinks the held order's lines and creates a sibling fulfillment order for the arrived units. Reports progress and announces release in both branches.
- **`withoutAllocated` (private)** — Subtracts allocated quantities from each held-order line; drops lines whose quantity reaches zero.
- **`allocatedLines` (private)** — Builds the new order's lines from the allocated quantities, copying product titles from the held order and zeroing `shippedQuantity`/`canceledQuantity`.

## Relationships

- **`../domain` (fulfillment.ts / index.ts)** — Provides `checkShipLines`, `remainingOfLine`, `statusOfLines` for line validation and status derivation, plus the `FulfillmentLine` and `ProductQuantity` types.
- **`../repository.ts`** — All persistence: `findById`, `findInSession`, `claim` (optimistic revision), `findByOrderId`, `create`.
- **`../model.ts`** — `FulfillmentOrderDocument` type used throughout.
- **`./act.ts`** — `runAct` wraps the transaction; `refuse` / `refuseMissing` produce the refusal envelopes.
- **`./announce.ts`** — `announceReleased` emits the `fulfillment_order.released` event after the split commits.
- **`./progress.ts`** — `reportProgress` updates the order's progress tracking.
- **`@modules/orders` (orders/index.ts → services/index.ts)** — `orderService.getById` is used to guard against a canceled parent order before entering the transaction.
- **`@types` (types/index.ts)** — `FulfillmentHoldReason`, `FulfillmentOrderStatus` enum values.
- **`release-allocated.ts`** — The sole caller of `splitForAllocation`.
- **`tests/unit/fulfillment.test.ts`** — Unit tests exercising the split paths.

## Notes

- **No route entry.** The file's module doc states explicitly that no HTTP route reaches it; it is an internal service call only.
- **`undefined` ≠ error.** `splitForAllocation` resolves to `undefined` for every failure case (order missing, canceled, wrong status, over-allocation, concurrent revision bump). Callers must check for `undefined` rather than catching exceptions.
- **Full-coverage shortcut.** When the allocation covers every remaining line, no new fulfillment order is created — the existing order is claimed with `holdReason`/`holdNote` unset. The `Split.held` field is simply absent.
- **`sourceShipmentId` carry-over.** The new (released) order inherits the held order's `sourceShipmentId` so that if a lost parcel is later located, the link to all still-owed units is preserved.
- **Line removal.** A held-order line whose entire quantity was allocated is filtered out entirely (not left at quantity 0), because the domain invariant is that a line carries at least one unit.
- **Numbering.** The new order's `number` is `max(existing siblings) + 1` within the same `orderId`; it does not reuse the held order's number.
