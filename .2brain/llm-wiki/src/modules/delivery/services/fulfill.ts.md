---
source: src/modules/delivery/services/fulfill.ts
sha256: 995b609d38c8456f8a211d72e68057b7d9911016f4a4e410a52847eee8ddd770
generated_at: 2026-11-14T19:46:44.942283+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/fulfill.ts

## Purpose

Implements the digital-fulfilment act: fulfilling a `digital` fulfillment order with no physical parcel. The shipment is cut and marked delivered in the same atomic write (mirroring Shopify's digital-line behaviour), the order is settled, and all announcements fire within one Mongoose transaction.

## Key elements

- **`Fulfilled`** (interface) — the tuple the act returns: the newly cut `ShipmentDocument` and the `OrderDocument`.
- **`fulfillAct`** (internal) — the transactional core. Validates the order (must be `digital`, `isFulfillable`, open for shipment, caller permitted to start), then in sequence: `cutShipment` (with `delivered: true`, `takeStock: true`), `startFulfillment`, `reportProgress`, `settleOrder`, `announceShipped`, `announceDelivered`.
- **`fulfillFulfillmentOrder`** (exported) — public entry point. Decides `mayStartFulfillment` *before* opening the transaction (retry-safe), runs the act via `runAct`, and on success refreshes the product shelf, records an audit entry, and wraps the result in `generateSuccess(viewShipment(…))`. On refusal, calls `auditUnearnedStart` and returns the reject.

## Relationships

- **`src/modules/delivery/services/act.ts`** — provides `runAct` (transaction wrapper), `readWithOrder` (loads fulfillment order + parent order), and `refuse` (structured 4xx rejection).
- **`src/modules/delivery/services/cut.ts`** — `cutShipment` creates the shipment document; called with `delivered: true` so the shipment is born final.
- **`src/modules/delivery/services/ship-gate.ts`** — permission and state gates: `mayStartFulfillment`, `refuseUnearnedStart`, `isOpenForShipment`, and `auditUnearnedStart` (logs a denied start attempt).
- **`src/modules/delivery/services/progress.ts`** — `startFulfillment`, `reportProgress`, `settleOrder` advance the order's lifecycle state within the same transaction.
- **`src/modules/delivery/services/announce.ts`** — `announceShipped` and `announceDelivered` emit domain events after the shipment is cut.
- **`src/modules/delivery/services/actions.ts`** — `viewShipment` serialises the shipment (with order context and caller's `actions`) into the API response shape.
- **`src/modules/delivery/domain/fulfillment.ts`** — `isFulfillable` and `remainderLines` validate and select lines to ship.
- **`src/modules/delivery/audit.ts`** — supplies `deliveryAuditActions` constants used in the audit log.
- **`src/modules/orders/index.ts`** — `orderService.refreshShelf` updates product shelf counts post-fulfilment; also provides the `OrderDocument` type.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `ResponseSuccess` / `ResponseReject` shape the HTTP payload.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the structured audit log entry.
- **`src/modules/delivery/tests/unit/lost.test.ts`** — unit tests exercising the digital-fulfilment path.

## Notes

- **Atomicity:** the shipment is created already-delivered; there is no intermediate "shipped" state persisted. `announceShipped` and `announceDelivered` are sequential calls *within* the same transaction, not separate writes.
- **`mayStart` is pre-transaction:** the permission verdict is computed before `runAct` opens the session so that a retried transaction cannot flip the answer.
- **`takeStock: true`:** even though no parcel moves, inventory is decremented (matches Shopify's digital-line semantics).
- **Two gate checks:** `refuseUnearnedStart` guards the caller's permission; `isOpenForShipment` guards the order's state. Both must pass before any mutation.
- **Shelf refresh is post-transaction:** `orderService.refreshShelf` runs *after* `runAct` resolves, so it is not part of the atomic unit.
