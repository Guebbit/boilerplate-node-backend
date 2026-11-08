---
source: src/modules/orders/services/fulfillment.ts
sha256: eaffc4b86ecec41fa3ba9d96655b4bf8dd6e7e614c73e3ca4ea920263e458066
generated_at: 2026-11-08T06:57:34.431814+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/fulfillment.ts

## Purpose

Service layer that provides the transactional write paths through which a fulfillment act (shipment, cancellation, lost-parcel recovery, payment hold) mutates the order's fulfillment summary and the inventory shelf. It exists so that `orders` remains the sole writer of its own fields while delegating stock-counters to `inventory`, with every read-then-write pair sharing one Mongoose session so concurrent acts (e.g. ship vs. cancel) resolve atomically.

## Key elements

- **`recordFulfillmentProgress`** – Conditionally writes a new `FulfillmentSummary` onto the order (only if still `paid`/`processing`/`shipped`); returns the updated order or `null`.
- **`readOrder`** – Reads an order snapshot inside the act's session so subsequent writes cannot be stale at commit time.
- **`shipStock`** – Decrements shelf counts per shipment line; the inverse is `releaseStock`.
- **`topUpStock`** – Re-reserves units for a reported-lost parcel (shelf first, remainder as a backorder claim outside the cap); the inverse is `releaseTopUp`.
- **`releaseTopUp`** – Returns units previously set aside by `topUpStock` when the "lost" parcel actually arrives; hold ends `shipped`, not `released`.
- **`releaseStock`** – Returns held units for a canceled remainder that was never shipped; the mirror of `shipStock`.
- **`extendHold`** – Pushes the hold expiry forward by `hours` (e.g. for multi-day bank debits); no-op if the hold is already claimed or absent.
- **`isPayableNow`** – Read-only gate before charging a card: order must be in a payable status **and** its hold must not yet be released.
- **`refreshShelf`** – Post-commit cache invalidation for the catalogue's stock counters (must run *after* the transaction commits because the cache write is non-transactional).

## Relationships

- **`@modules/inventory`** (`inventoryService`, `StockLine`, `TopUp`): all shelf/hold operations (`shipStock`, `topUpStock`, `releaseTopUp`, `releaseStock`, `extendHold`, `isPayableNow`'s hold check) delegate to `inventoryService`; `TopUp` and `StockLine` types shape the return values.
- **`../repository`** (`orderRepository`): `recordFulfillmentProgress` and `readOrder` call `orderRepository.writeFulfillment` / `findInSession`; `isPayableNow` calls `findByIdScoped`.
- **`../domain`** (`isPayable`, `FulfillmentSummary`): `isPayable` gates the payable check; `FulfillmentSummary` is the payload for `recordFulfillmentProgress`.
- **`../model`** (`OrderDocument`): return type for `recordFulfillmentProgress` and `readOrder`.
- **`../services/index.ts`**: barrel export that re-exports this module's public API.
- **`../tests/integration/hold-doors.test.ts`**, **`ship-stock.test.ts`**: integration tests that exercise the hold-extension, ship/release, and top-up/release paths through this service.

## Notes

- Every function that mutates state accepts a `ClientSession`; the caller (the act orchestrator) owns the transaction boundary. The sole exception is `extendHold` and `refreshShelf`, which are called outside the act's transaction.
- `refreshShelf` must be invoked **after** the transaction has committed; calling it inside the session would write to a cache that cannot roll back.
- `recordFulfillmentProgress`'s conditional write (status must still be fulfillable) is the mechanism that lets a ship and a cancel racing in separate transactions resolve to exactly one winner—no application-level lock is involved.
- `topUpStock` / `releaseTopUp` (lost-parcel pair) and `shipStock` / `releaseStock` (cancellation pair) are distinct mirrors: the former re-creates a hold that was broken by loss, the latter releases a hold that was never consumed. Mixing them up will corrupt shelf counts.
- `isPayableNow` is intentionally a read-only check used *before* charging; doors that record an already-taken payment do not call it.
