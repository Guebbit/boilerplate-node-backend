# src/modules/inventory/openapi.yaml

## Purpose
OpenAPI 3.0.3 contract (v2.0.0) defining the inventory module's REST surface: stock levels, the append-only movement ledger, inbound receipts, stocktake adjustments, and the reservation-sweep tick. It is the single source of truth for what the inventory module exposes and is the only writer of the `Product.onHand` and `Product.reserved` counters.

## Key elements

- **`GET /inventory/levels`** — Paged stock board (most-scarce-first) with a `lowOnly` filter for the deployment's low-availability threshold.
- **`GET /inventory/movements`** — Paged, newest-first ledger of counter changes; filterable by `productId` and `reason`. `meta.totalItems` reports the full match count, not just the current page.
- **`POST /inventory/receipts`** — Supplier delivery; increments `onHand`, leaves `reserved` untouched. The only transition that can create units.
- **`POST /inventory/adjustments`** — Signed stocktake correction. Returns **409** if the correction would drive `onHand` below current `reserved`.
- **`POST /inventory/reservations/sweep`** — Idempotent tick that expires stale holds and returns the count released. Driven externally (cron / platform job), not by an in-process scheduler.
- **`StockMovementReason`** — Enum (`reserve`, `commit`, `release`, `expire`, `receive`, `adjust`); each value implies a fixed pair of signed deltas, authoritative mapping lives in `domain/transitions.ts`.
- **`StockMovement`** — One ledger row; records **both** `onHandDelta` and `reservedDelta` so the ledger is replayable (summing each column reproduces the counter). Append-only, no update path.
- **`ReceiptRequest`, `AdjustmentRequest`, `InventoryLevelEnvelope`, `ReservationSweepEnvelope`, `StockMovementsResponseEnvelope`** — (and other) request/response schemas under `components.schemas`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — `$ref`s shared parameters (`PageParam`, `PageSizeParam`), schemas (`Id`, `ErrorResponse`), and standard error responses (`401`, `403`, `404`, `422`, `500`). This file inherits the cross-module conventions defined there.
- **`domain/transitions.ts`** — Cited in the `StockMovementReason` description as the single place where each reason is mapped to its concrete `(onHandDelta, reservedDelta)` pair. The OpenAPI enum documents the names; the TS module owns the arithmetic.
- **`src/modules/feedback/openapi.yaml`** — Sibling module contract at the same directory level; no direct `$ref` in this file, but both resolve shared components from the same `openapi.root.yaml` and are consumed together by the API gateway / client codegen pipeline.

## Notes

- **Ownership boundary:** The `products` module *declares* `onHand`/`reserved` (it owns the collection); only this inventory module *writes* them. All other modules read.
- **Sweep is not a scheduled job internally.** The spec deliberately exposes it as an admin endpoint so an external tick (cron, platform scheduler, operator) can drive it—same pattern as `POST /delivery/advance`. Running it twice is safe (idempotent).
- **Ledger replayability invariant:** Summing `onHandDelta` (respectively `reservedDelta`) across a product's movements must equal that product's current counter. This is asserted in the module's test suite; any new reason added to the enum must keep the property true.
- **409 on adjust:** The only non-standard error code in the module. It signals a business-rule violation (would break the `onHand ≥ reserved` invariant), distinct from the 422 validation errors used elsewhere.
- **Descriptions are normative.** The long `description` fields encode design rationale (e.g., why `expire` is separate from `release`, why the sweep is external). Treat them as part of the contract, not just documentation.
