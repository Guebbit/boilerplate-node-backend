---
source: src/modules/delivery/services/cut.ts
sha256: 27d4b996cd88c16370745569ef9c690f0a607c70f50836fdd94e47207025a3ed
generated_at: 2026-10-14T15:28:24.661268+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/cut.ts

## Purpose

Implements the single write path that turns a portion of a fulfillment order into a shipment document. Every shipping flow—staff shipping, digital fulfilment, and admin status overrides—funnels through this one function so the claim, shipment creation, and stock decrement stay consistent. It runs inside the act's Mongoose transaction and uses optimistic concurrency (revision-based claim) to prevent two acts from shipping the same remaining lines.

## Key elements

- **`CutInput`** (interface) — Parameters for a cut: the snapshot `fulfillmentOrder`, the `lines` to ship, optional `trackingCode`, `forced` flag, `delivered` flag (digital path skips `shipped` and lands directly on `delivered`), timestamp `at`, and `takeStock` (set `false` when an upstream override already decremented inventory).
- **`Cut`** (interface) — Return shape: the created `shipment` and the claimed `fulfillmentOrder`.
- **`cutShipment(input, session)`** (exported const) — The only runtime export. Steps in order:
  1. Computes merged shipped lines via `withShipped` and derives the new status via `statusOfLines`.
  2. Calls `fulfillmentOrderRepository.claim(id, revision, …, session)` — if the revision no longer matches, returns `refuse(409, …)`.
  3. Allocates a per-order sequence number via `shipmentRepository.nextNumber`.
  4. Inserts the `ShipmentDocument` (status `shipped` or `delivered`, optional `trackingCode`/`deliveredAt`).
  5. If `takeStock` is `true`, calls `orderService.shipStock(orderId, lines, session)`; otherwise resolves immediately.
  6. Returns `{ shipment, fulfillmentOrder: claimed }`.

## Relationships

- **`../domain` (`domain/index.ts`, `domain/fulfillment.ts`)** — Imports `statusOfLines`, `withShipped`, and the `ProductQuantity` type for line computation.
- **`../repository.ts`** — Uses `fulfillmentOrderRepository.claim` (optimistic-lock read-then-write) and `shipmentRepository.nextNumber` / `.create` for the shipment insert.
- **`../model.ts`** — Types `FulfillmentOrderDocument` and `ShipmentDocument` for input/output shapes.
- **`./act.ts`** — Imports `refuse` to signal the 409 conflict when the revision claim fails.
- **`@modules/orders` (`src/modules/orders/index.ts` → `services/index.ts`)** — Calls `orderService.shipStock` to decrement inventory within the same transaction.
- **`./ship.ts`, `./fulfill.ts`, `./override-sync.ts`** — Upstream callers that invoke `cutShipment` inside their respective act transactions (staff ship, digital fulfilment, override-sync).
- **`tests/unit/fulfillment.test.ts`** — Unit tests that exercise the fulfillment-order state transitions this cut relies on.

## Notes

- **Revision-based claiming:** `before.revision` is passed to `claim`; a stale revision means another act already mutated the order, and the act is refused (409 `DELIVERY_NOT_SHIPPABLE`). There is no retry loop here—retry (if any) is the caller's responsibility.
- **Hold clearing:** On a successful claim, `holdReason` and `holdNote` are unset on the fulfillment order. Shipping always lifts a hold.
- **`takeStock` flag:** Set to `false` by the override-sync path because the override already decremented stock. Forgetting to flip it would double-decrement.
- **`delivered` flag:** When `true`, the shipment is created with status `delivered` and a `deliveredAt` timestamp; no separate "mark delivered" step follows.
- **Shipment number:** Allocated per order (`nextNumber(orderId)`), not globally. Two different orders can both have shipment `#1`.
- **Title fallback:** If a shipped line's `productId` is not found in the fulfillment order's snapshot lines, the shipment line's `title` defaults to an empty string rather than throwing.
