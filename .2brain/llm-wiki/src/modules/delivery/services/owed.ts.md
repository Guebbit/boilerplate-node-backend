---
source: src/modules/delivery/services/owed.ts
sha256: ec6d332f540013e7f1105fca993efef5f38cc9bb616a24a0012a2b8775dee942
generated_at: 2026-11-08T05:37:34.729707+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/owed.ts

## Purpose

Handles the portion of a re-send that available stock cannot cover immediately: units the shop still owes the buyer (a lost parcel or a guarantee replacement). Computes the restock-based promise dates and creates the fulfillment order that sits on hold awaiting stock, outside the normal backorder cap.

## Key elements

- **`Owed`** (interface) — one re-sent line: `productId` + `quantity`.
- **`OwedOrigin`** (interface) — contextual info for the owed order: the parent `orderId`, a `titleOf(productId)` callback that resolves the original line title, and an optional `sourceShipmentId` linking back to a lost shipment.
- **`promiseFor(owed, now)`** — looks up each product's `restockDate` via `productService.findManyByIds`, then delegates to `owedDateOf` (with `BACKORDER_PROMISE_DAYS`) to produce the `OwedDate` promise.
- **`createOwedFulfillmentOrder(origin, owed, promise, session)`** — builds and persists the fulfillment order: numbered after existing siblings, `kind: physical`, `holdReason: awaiting_stock`, `cause: 'backorder'`, timestamps set to the promise date, and `sourceShipmentId` set only when the origin is a lost parcel. Runs inside the caller's Mongoose transaction.

## Relationships

- **`../domain`** (`fulfillment.ts`, `lost.ts`, `index.ts`) — imports `owedDateOf`, `statusOfLines`, and the `OwedDate` type.
- **`../repository.ts`** — `fulfillmentOrderRepository.findByOrderId` (numbering) and `.create` (persistence).
- **`../model.ts`** — `FulfillmentOrderDocument` return type.
- **`@modules/products`** — `productService.findManyByIds` for restock-date lookup in `promiseFor`.
- **`@modules/shop`** — `BACKORDER_PROMISE_DAYS` constant passed into `owedDateOf`.
- **`@types`** — `FulfillmentHoldReason.awaiting_stock`, `FulfillmentOrderKind.physical`.
- **`services/lost.ts` / `services/reship.ts`** — sibling services that are the expected callers (they supply the `OwedOrigin`, `Owed[]`, and session).
- **`tests/unit/fulfillment.test.ts`** — exercises the owed-order creation path.

## Notes

- `titleOf` is a **callback** the caller must provide; this module does not fetch titles itself.
- `sourceShipmentId` is conditionally spread (`...(id ? { sourceShipmentId: id } : {})`), so the field is simply absent for replacement orders.
- Numbering uses `Math.max(...siblings.map(s => s.number)) + 1`; if `siblings` is empty this evaluates to `NaN`. Callers are expected to guarantee at least one prior order exists.
- `shippedQuantity` and `canceledQuantity` are always `0` at creation — the order is purely a forward-looking hold.
- The `defaulted` flag on the promise is spread conditionally to avoid persisting an explicit `false`.
