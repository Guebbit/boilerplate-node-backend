---
source: src/modules/delivery/domain/fulfillment.ts
sha256: e4a3c3b3b6cf3ca3e5922229929fe987ed3711e8f080d09d50f658e18c215f03
generated_at: 2026-10-29T03:32:49.436179+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/fulfillment.ts

## Purpose

Pure domain rules that turn a paid order's frozen lines into fulfillment orders: how lines are split (ordinary vs. bespoke vs. waiting), what remains on each line, and what status follows from the lines' state. Keeping this logic free of I/O makes every branch testable without a database.

## Key elements

- **`WaitCause`** — `'preorder' | 'backorder'`; why a fulfillment order is held for stock.
- **`FulfillmentLine`** — one product on a fulfillment order with `quantity`, `shippedQuantity`, `cancelledQuantity`.
- **`GroupableLine`** — a line as read from the order's frozen snapshot; carries `ships`, `preorder`, `releaseDate`, `noWithdrawal`, and `backorder` metadata.
- **`FulfillmentOrderDraft`** — the shape `groupOrderLines` returns before it is persisted; includes `kind`, `status`, `lines`, optional `holdReason`, `agreedAt`, `expectedAt`, `cause`, and `defaulted`.
- **`remainingOfLine` / `remainingOf`** — compute unshipped, uncancelled units for one line or a set of lines.
- **`groupOrderLines(lines, timeZone)`** — the core splitting rule. Produces numbered drafts: one `open` order for ordinary ready lines, one for `noWithdrawal` ready lines, then one `on_hold` order per distinct (shop-day × cause × noWithdrawal × defaulted) group of waiting lines.
- **`statusOfLines(lines, held)`** — derives `FulfillmentOrderStatus` from remaining units, shipped units, and hold flag; never set by a caller.
- **`ProductQuantity` / `ShipLinesVerdict`** — input/output types for shipment validation.
- **`checkShipLines(lines, requested)`** — validates a staff shipment request against what remains; returns the concrete lines to ship or a failure reason (`nothing-remains`, `unknown-product`, `too-many`).

## Relationships

- **`src/domain-primitives/time.ts`** — imports `dayInZone` so waiting lines are grouped by the shop's calendar day rather than UTC.
- **`src/modules/delivery/domain/index.ts`** — barrel for the delivery domain; re-exports this module's public types and functions.
- **`src/modules/delivery/services/fulfill.ts`** — the primary consumer: calls `groupOrderLines` when an order is paid, then persists the resulting drafts.
- **`src/modules/delivery/services/cancel-remainder.ts`** — uses `remainingOf` / `statusOfLines` to decide what is still cancellable.
- **`src/modules/delivery/services/cut.ts`** — calls `checkShipLines` to validate and size a shipment before cutting it.
- **`src/modules/delivery/services/found.ts`** — applies `remainingOfLine` when a lost-parcel unit is restored to a fulfillment order.
- **`src/modules/delivery/presenter.ts`** — reads `FulfillmentOrderDraft` / `FulfillmentLine` to build display output.
- **`src/modules/delivery/repository.ts`** — persists the drafts produced by `groupOrderLines` and reads them back.
- **`src/modules/delivery/domain/preorder.ts` / `lost.ts` / `reship.ts`** — sibling domain modules that mutate `FulfillmentLine` quantities (preorder release, lost-parcel re-owes, reship) and rely on `remainingOfLine` and `statusOfLines` to keep state consistent.

## Notes

- `groupOrderLines` is **pure** and returns `FulfillmentOrderDraft[]`; the caller is responsible for numbering (already done) and persistence.
- The `defaulted` flag on a waiting draft means the promise date came from the 30-day catalogue default, not a product-specific date. Downstream logic (e.g., a later catalogue change) must skip updating `expectedAt` when this flag is set.
- `noWithdrawal` lines are split into their own `open` order specifically so that cancelling the rest of the order does not cancel bespoke work (Q-W2 decision S4).
- `checkShipLines` treats a duplicate `productId` in `requested` as a sum; it does not reject the duplicate.
- The file is intentionally free of imports from `repository.ts`, `database.ts`, or any service — all inputs are plain data.
