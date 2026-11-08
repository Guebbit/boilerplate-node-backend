---
source: src/modules/delivery/tests/unit/fulfillment.test.ts
sha256: c5562314bac0b4dc6721fb153cc0bc3277a541174ac1e56a3b8195c6df88e38d
generated_at: 2026-11-08T05:45:38.786045+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/fulfillment.test.ts

## Purpose
Unit tests for the pure fulfillment-rule functions that decide how an order's lines split into fulfillment orders, what remains after partial shipments or cancellations, what status a fulfillment order takes, and which lines a shipment may carry. The file exists to lock down the grouping, remainder, status, and ship-check contracts without any service or transport layer.

## Key elements
- **`line(productId, quantity, fields?)`** – local factory that builds a `FulfillmentLine` with zero shipped/canceled defaults.
- **`groupable(productId, quantity, fields?)`** – local factory that builds a `GroupableLine` with `ships: true` default.
- **`describe('groupOrderLines', …)`** – the largest suite; verifies grouping into physical/digital orders, preorder release-day splitting (including timezone-aware day boundaries), backorder splitting (shelf vs. owed, dated vs. 30-day default), made-to-order (`noWithdrawal`) separation, and numbering/status of the resulting drafts.
- **`describe('remaining', …)`** – covers `remainingOfLine`, `remainingOf`, and `remainderLines` (quantity minus shipped and canceled; fully-remaindered lines are dropped).
- **`describe('statusOfLines', …)`** – table-driven check of the `open → in_progress → on_hold → closed / canceled` status derivation from shipped, canceled, and hold flags.
- **`describe('checkShipLines', …)`** – validates that the function returns all remaining lines when none are named (truncated in this view).

## Relationships
- **`src/modules/delivery/domain/index.ts`** – the sole import source (`../../domain`); re-exports every function under test (`groupOrderLines`, `statusOfLines`, `checkShipLines`, `remainingOf`, `remainingOfLine`, `remainderLines`, `isFulfillable`, `isHoldable`, `isReleasable`, `isShippable`, `summarize`, `withRemainderCanceled`, `withShipped`) and the `FulfillmentLine` / `GroupableLine` types.
- **`src/modules/delivery/domain/fulfillment.ts`** – the implementation file that the barrel re-exports; all tested behavior ultimately lives here.
- **`src/modules/delivery/domain/preorder.ts`** – defines the `preorder` / `releaseDate` fields exercised in the grouping tests.
- **`src/modules/delivery/domain/reship.ts`** – defines the `backorder` (`quantity`, `promisedAt`, `dated`) shape used in the backorder-splitting tests.

## Notes
- The `groupable` helper sets `ships: true` by default; tests that exercise digital lines must explicitly pass `{ ships: false }`.
- Preorder grouping is **day-boundary** in the caller's IANA timezone (second argument to `groupOrderLines`), not an instant. The "Europe/Rome" test demonstrates that two UTC instants on different UTC dates can land on the same local shop day and be grouped together.
- A preorder line with **no** `releaseDate` is treated as an ordinary line (status `open`), not held.
- `statusOfLines` returns `closed` (not `on_hold`) when a hold flag is set but nothing remains—i.e., a hold on a fully-shipped order is ignored.
- The file is a pure unit test: no mocks, no service imports, no network or filesystem I/O.
