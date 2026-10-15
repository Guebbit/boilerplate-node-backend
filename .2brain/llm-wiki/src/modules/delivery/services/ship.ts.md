---
source: src/modules/delivery/services/ship.ts
sha256: bcbc3b4feef6b61261ec3c9279d4b03b5bf690ee22b5edf0d28faf6ce49d4105
generated_at: 2026-10-15T10:28:22.710730+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ship.ts

## Purpose

Implements the staff "ship" action: cutting one or more shipments out of a fulfillment order. All data changes (lines, shipment record, units, order summary, status, `shipped` flag) commit in a single transaction; mail, audit, and shelf-cache refresh happen only after the commit succeeds.

## Key elements

- **`ShipInput`** (exported interface) — what staff submits: `lines` (partial or full), `trackingCode`, `forced` flag, and `reason` for forced ships.
- **`shipFulfillmentOrder`** (exported) — entry point. Runs the force-eligibility check, reads the fulfillment order and order outside the transaction, checks the rank rule, then delegates to `runAct` → `shipAct`, and on success chains `afterShipped` → `viewShipment` → 201 response.
- **`shipAct`** (internal) — the transactional body. Reads entities in-session, runs the three gates, calls `cutShipment`, advances order status if needed, reports progress, settles the order, records forced-fulfilment override, and emits `announceShipped`.
- **`gateOrder` / `gateFulfillmentOrder` / `gateTracking`** (internal) — validation gates that throw `ActRefusal` with specific error codes before any write lands.
- **`afterShipped`** (internal) — post-commit chain: `refreshShelf` → `notifyShipped` → `recordAudit`.
- **`Shipped`** (internal interface) — the value handed from `shipAct` to `afterShipped` (shipment doc, order doc, remaining units).

## Relationships

- **`@infrastructure/http/response`** — builds all success/reject HTTP payloads (`generateSuccess`, `generateReject`, `fieldError`).
- **`@infrastructure/i18n`** — localises all human-readable refusal and error messages via `t`.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit row after commit.
- **`../audit`** (`deliveryAuditActions`) — supplies the action constant `ADMIN_ORDER_SHIPPED` used in the audit record.
- **`../domain`** (fulfillment, rates) — `isShippable`, `checkShipLines` for line validation; `findShippingMethod` to determine whether a tracking code is required.
- **`../model`** — `FulfillmentOrderDocument` and `ShipmentDocument` type shapes.
- **`../repository`** — `fulfillmentOrderRepository.findInSession` / `findById` for data access.
- **`./act`** — `runAct` (transaction wrapper), `refuse` / `refuseMissing` (structured refusals), `ActRefusal` (thrown for gate failures).
- **`./actions`** — `viewShipment` shapes the API response view.
- **`./announce`** — `announceShipped` emits the in-transaction shipped event.
- **`./cut`** — `cutShipment` performs the actual line/unit/shipment writes.
- **`./force`** — `refuseUnearnedForce` checks caller permission and reason before the transaction opens.

## Notes

- **Two-phase commit discipline.** Everything that mutates state lives inside `runAct`'s session. The three post-commit steps (shelf refresh, buyer notification, audit) run sequentially *after* the session closes and cannot roll back the shipment.
- **`forced` semantics.** Widen *which* order statuses may ship (`paid` in addition to `processing`); it never changes *what* is written, never bypasses `on_hold` or `cancelled`, and requires `orders.any.override` plus a `reason` string recorded on the order's override history.
- **Tracking-code requirement is dynamic.** `findShippingMethod` is called at ship time, not frozen at checkout, so a rate change upstream can newly require (or no longer require) a tracking code.
- **Rank check is pre-transaction.** `orderService.outrankedRefusalFor` runs before `runAct` opens a session; a rank refusal writes nothing and returns immediately.
- **Absent `lines` means "everything remaining."** `gateFulfillmentOrder` resolves the omission via `checkShipLines`, so callers need not enumerate the full remainder.
