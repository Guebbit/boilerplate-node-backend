---
source: src/modules/delivery/services/fulfill.ts
sha256: 66e4aef20a1213e89682565fccee9da7b7e9f62afdaae4dbc489f219861cee88
generated_at: 2026-10-14T15:29:57.464449+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/fulfill.ts

## Purpose

Implements the **digital fulfilment** flow: fulfilling a `digital`-kind fulfillment order where no physical parcel exists. The shipment is cut with no tracking number and is both born and delivered in the same transaction (mirroring Shopify's treatment of digital lines). When nothing else remains unshipped, the order is completed in that same write, with the withdrawal clock anchored to the payment date (Art. 9(2)(c) digital content).

## Key elements

- **`Fulfilled`** (interface) — shape returned by the act: `{ shipment, order }`.
- **`fulfillAct`** (internal, not exported) — the transactional core. Validates the fulfillment order (exists, order is `processing`, kind is `digital`, fulfillable), then in sequence: `cutShipment` (delivered immediately, no tracking), `reportProgress`, `settleOrder`, `announceShipped`, `announceDelivered`. Returns `Fulfilled` or a refusal.
- **`fulfillFulfillmentOrder`** (exported) — public entry point. Performs pre-transaction lookups (fulfillment order, order, outranked-refusal check), wraps `fulfillAct` in `runAct`, then post-commits: refreshes shelf, fires `notifyDelivered`, records an audit entry, and builds the HTTP success response via `viewShipment`.

## Relationships

- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` and the `ResponseSuccess`/`ResponseReject` types shape the returned API response.
- **`@infrastructure/i18n`** — `t()` resolves user-facing refusal and error strings.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit entry after a successful fulfilment.
- **`src/modules/delivery/audit.ts`** — supplies `deliveryAuditActions.ADMIN_ORDER_FULFILLED` as the audit action constant.
- **`src/modules/delivery/domain/`** — `isFulfillable` guards whether the order can be fulfilled; `remainderLines` extracts the lines to cut.
- **`src/modules/delivery/repository.ts`** — `fulfillmentOrderRepository` provides `findById` (pre-transaction) and `findInSession` (inside the transaction).
- **`src/modules/delivery/model.ts`** — `ShipmentDocument` type used in the `Fulfilled` interface and `cutShipment` return.
- **`src/modules/delivery/services/act.ts`** — `runAct` opens the Mongoose session/transaction; `refuse` / `refuseMissing` produce typed refusals.
- **`src/modules/delivery/services/actions.ts`** — `viewShipment` assembles the API response payload.
- **`src/modules/delivery/services/announce.ts`** — `announceShipped` and `announceDelivered` emit domain events within the transaction.
- **`src/modules/delivery/services/cut.ts`** — `cutShipment` creates the shipment record (delivered, no tracking, stock taken).
- **`src/modules/delivery/services/notify.ts`** — `notifyDelivered` fires the post-commit delivery notification.
- **`src/modules/delivery/services/index.ts`** — barrel that re-exports this module's public API.

## Notes

- The module is restricted to `digital`-kind orders; a physical fulfilment order hitting this path gets a `409 DELIVERY_NOT_DIGITAL` refusal.
- `fulfillAct` is deliberately non-exported; callers must go through `fulfillFulfillmentOrder`, which adds the outranked-refusal check, shelf refresh, notification, and audit that the bare act skips.
- The shipment is both shipped **and** delivered in one write (no intermediate "shipped-undelivered" state), so `announceShipped` and `announceDelivered` fire back-to-back inside the same transaction.
- `reportProgress` / `settleOrder` (imported from `./progress`) handle order-status transitions and are not part of the graph-neighbor list above but are essential to the "completes the order" behaviour described in the module docblock.
