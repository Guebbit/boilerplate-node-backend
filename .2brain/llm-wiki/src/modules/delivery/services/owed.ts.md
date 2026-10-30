---
source: src/modules/delivery/services/owed.ts
sha256: 605bdd8f586753cdb787bcb1624a4de00a0b870919143244b4e223ed8c4c4082
generated_at: 2026-10-29T03:41:44.331527+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/owed.ts

## Purpose

Creates the "owed" side of a re-send: the units the shop still owes the buyer (a lost parcel or a guarantee replacement) that shelf stock cannot cover. It resolves a restock-based promise date and writes a fulfillment order that is placed **on hold for stock** (`cause: backorder`), outside the normal backorder cap, so the units ship once restocked.

## Key elements

- **`Owed`** (interface) — a single owed line: `productId` + `quantity`.
- **`OwedOrigin`** (interface) — context for creating the order: the parent `orderId`, a `titleOf(productId)` callback for line titles, and an optional `sourceShipmentId` that links back to the lost shipment (absent for guarantee replacements).
- **`promiseFor(owed, now)`** — resolves restock dates via `productService.findManyByIds`, then delegates to `owedDateOf` (from `../domain`) with `BACKORDER_PROMISE_DAYS` to produce the `OwedDate` promise.
- **`createOwedFulfillmentOrder(origin, owed, promise, session)`** — builds and persists the hold fulfillment order:
  - Assigns `number` as `max(existing siblings) + 1` for the same order.
  - Sets `kind: physical`, `holdReason: awaiting_stock`, `cause: 'backorder'`.
  - Sets `agreedAt`, `promisedAt`, and `expectedAt` all to `promise.at`.
  - Conditionally includes `defaulted: true` (only when the promise defaulted) and `sourceShipmentId` (only for lost-parcel cases).
  - Computes initial `status` via `statusOfLines(lines, true)`.

## Relationships

- **`src/modules/delivery/domain/index.ts`** — imports `owedDateOf`, `statusOfLines`, and the `OwedDate` type.
- **`src/modules/delivery/repository.ts`** — uses `fulfillmentOrderRepository.findByOrderId` (to determine next `number`) and `.create` (to persist the order).
- **`src/modules/delivery/model.ts`** — imports the `FulfillmentOrderDocument` type for the return value.
- **`src/modules/products/index.ts`** — calls `productService.findManyByIds` to fetch restock dates.
- **`src/modules/shop/index.ts`** — imports `BACKORDER_PROMISE_DAYS` as the grace window for the promise.
- **`src/types/index.ts`** — imports `FulfillmentHoldReason` and `FulfillmentOrderKind` enum members.

## Notes

- `OwedOrigin.titleOf` is a **callback**, not a pre-resolved string. The caller (e.g., `lost.ts` or `reship.ts`) supplies the mapping, keeping this module agnostic of how titles are stored.
- `number` is per-order (max sibling + 1), **not** a global sequence.
- `sourceShipmentId` is the only field that distinguishes a lost-parcel owed order from a guarantee-replacement owed order; its absence is the signal.
- The `defaulted` flag is spread conditionally (`...(promise.defaulted ? { defaulted: true } : {})`) so the document never carries `defaulted: false`.
- All three timestamp fields (`agreedAt`, `promisedAt`, `expectedAt`) are set to the same `promise.at` value — they diverge only if later state changes modify them.
