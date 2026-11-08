---
source: src/modules/delivery/services/fulfill.ts
sha256: a0ce2f7cccbd87ab41b33161f9c6d924a62981e7d641523de20dc02db40b8e4e
generated_at: 2026-11-08T05:35:50.664903+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/fulfill.ts

## Purpose

Implements the digital fulfillment act: it cuts a shipment that is born already delivered (no tracking, no parcel), then in the same transaction starts the fulfillment clock, reports progress, settles the order, and announces both "shipped" and "delivered" — completing a digital order in one write.

## Key elements

- **`Fulfilled`** (internal interface) — the shape returned by the transactional core: the `ShipmentDocument` and the `OrderDocument` after the act commits.
- **`fulfillAct`** (internal async fn) — the transaction body. Validates the order is digital, fulfillable, and open; cuts a shipment with `delivered: true` and `takeStock: true`; calls `startFulfillment`, `reportProgress`, `settleOrder`, `announceShipped`, and `announceDelivered` in sequence.
- **`fulfillFulfillmentOrder`** (exported) — the public entry point. Decides `mayStart` *before* opening the transaction, delegates to `fulfillAct` via `runAct`, handles the refusal path (audits unearned start, returns reject), and on success refreshes the product shelf, records an audit entry, and wraps the result with `generateSuccess(viewShipment(…))`.

## Relationships

- **`services/act.ts`** — provides `runAct` (transaction runner), `readWithOrder` (loads fulfillment order + parent order), and `refuse` (structured 4xx exit).
- **`services/cut.ts`** — provides `cutShipment`, which creates the shipment document within the transaction.
- **`services/progress.ts`** — provides `startFulfillment`, `reportProgress`, and `settleOrder`, the three progression steps run after the cut.
- **`services/announce.ts`** — provides `announceShipped` and `announceDelivered`, both called in the same transaction.
- **`services/ship-gate.ts`** — provides `mayStartFulfillment` (pre-transaction permission check), `refuseUnearnedStart`, `isOpenForShipment`, and `auditUnearnedStart` (refusal-path audit).
- **`services/actions.ts`** — provides `viewShipment` to shape the response payload.
- **`domain/index.ts`** (→ `domain/fulfillment.ts`) — provides `isFulfillable` and `remainderLines` for validation and line selection.
- **`delivery/audit.ts`** — provides `deliveryAuditActions.ADMIN_ORDER_FULFILLED` used in the audit record.
- **`infrastructure/http/response.ts`** — provides `generateSuccess` and the `ResponseSuccess`/`ResponseReject` types for the HTTP envelope.
- **`infrastructure/observability/audit.ts`** — provides `recordAudit` for the post-commit audit entry.
- **`modules/orders/index.ts`** — provides `orderService.refreshShelf` (post-commit shelf invalidation) and the `OrderDocument` type.
- **`delivery/model.ts`** — supplies the `ShipmentDocument` type used throughout.
- **`services/index.ts`** — barrel re-export that makes this module's `fulfillFulfillmentOrder` available to callers.
- **`tests/unit/lost.test.ts`** — unit tests that exercise the refusal / lost-fulfillment paths in this service.

## Notes

- `mayStartFulfillment` is evaluated **before** the transaction opens so that a retried transaction cannot change the permission verdict.
- The shipment is created with `delivered: true` in a single `cutShipment` call — there is no intermediate "shipped" state; both `announceShipped` and `announceDelivered` are emitted back-to-back to preserve event-order expectations downstream.
- The shelf refresh (`orderService.refreshShelf`) and the audit record run **after** the transaction commits (outside `runAct`), so they execute even if the caller's HTTP connection drops, but they are not part of the atomic write.
- `takeStock: true` is passed to `cutShipment`, meaning digital fulfillment still decrements stock — verify this is intentional if digital SKUs are meant to be non-inventory.
