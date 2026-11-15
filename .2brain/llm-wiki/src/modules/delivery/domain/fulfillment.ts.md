---
source: src/modules/delivery/domain/fulfillment.ts
sha256: 08d9e37690570b8725fabf7d72586acc94fa4dfbfa99e848ae4b71ee5e88cde0
generated_at: 2026-11-14T19:39:14.447051+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/fulfillment.ts

## Purpose

Pure domain rules that decide how an order's lines split into fulfillment orders, what remains on each line, what status a fulfillment order derives, and which lines a shipment may carry. No I/O, no database — every rule is unit-testable in isolation.

## Key elements

- **`groupOrderLines(lines, timeZone)`** — the central grouping rule. Splits an order's `GroupableLine[]` into `FulfillmentOrderDraft[]`: one open order for ordinary now-ships, one open order for `noWithdrawal` now-ships, then one `on_hold` order per (shop-day, bespoke, cause, defaulted) group of waiting lines.
- **`statusOfLines(lines, held)`** — derives `FulfillmentOrderStatus` from line quantities and hold state. Never set by a caller.
- **`checkShipLines(lines, requested?)`** — validates a ship request against remaining quantities; returns a `ShipLinesVerdict` discriminated union (`ok` with `ProductQuantity[]`, or `ok:false` with a reason).
- **`remainingOfLine` / `remainingOf`** — compute unsent units (`quantity − shipped − canceled`) for one line or a group.
- **`FulfillmentLine`** — a line as stored on a fulfillment order (productId, title, quantity, shippedQuantity, canceledQuantity).
- **`GroupableLine`** — a line as read from the order's frozen snapshot; carries `ships`, `preorder`, `releaseDate`, `noWithdrawal`, `backorder`.
- **`FulfillmentOrderDraft`** — the output of grouping before persistence (number, kind, status, lines, hold fields, `cause`, `defaulted`).
- **`WaitCause`** — `'preorder' | 'backorder'`.
- **`ShipLinesVerdict`** — the ok/fail union returned by `checkShipLines`.
- Private helpers: `kindOf`, `toFulfillmentLine`, `partsOf`, `promisedAt`.

## Relationships

- **`src/domain-primitives/time.ts`** — imports `dayInZone` to bucket waiting lines by the shop's calendar day when building the grouping key.
- **`src/modules/delivery/domain/index.ts`** — barrel that re-exports this module's public surface so the rest of the delivery domain can import from one path.
- **`src/modules/delivery/domain/lost.ts`** — moves owed units between fulfillment orders; consumes `FulfillmentLine` and `remainingOfLine`.
- **`src/modules/delivery/domain/preorder.ts`** — supplies the `preorder` / `releaseDate` facts that `groupOrderLines` reads off `GroupableLine`.
- **`src/modules/delivery/domain/reship.ts`** — builds a reshipment from the same `FulfillmentLine` shape and `checkShipLines` guard.
- **`src/modules/delivery/model.ts`** — defines the persisted entity that mirrors `FulfillmentOrderDraft` once a number is assigned and it is written.
- **`src/modules/delivery/presenter.ts`** — maps `FulfillmentLine` and `FulfillmentOrderStatus` into the shapes the UI renders.
- **`src/modules/delivery/repository.ts`** — the I/O boundary; persists drafts and loads lines back for the services.
- **`src/modules/delivery/services/actions.ts`** — consumes the exports of this module when performing delivery actions.
- **`src/modules/delivery/services/cancel-remainder.ts`** — relies on `remainingOf` to decide how many units a cancellation consumes.
- **`src/modules/delivery/services/cut.ts`** — calls `checkShipLines` to validate a ship request before writing shipment records.
- **`src/modules/delivery/services/ensure.ts`** — calls `groupOrderLines` when an order transitions to paid, then persists the resulting drafts.
- **`src/modules/delivery/services/found.ts`** — uses `checkShipLines` / `remainingOfLine` when a previously lost item is located and added to a shipment.
- **`src/modules/delivery/services/fulfill.ts`** — calls `statusOfLines` after mutating shipped/canceled quantities to recompute the order's status.
- **`src/modules/delivery/services/holds.ts`** — reads `FulfillmentOrderDraft.cause` / `.defaulted` and manages `on_hold` ↔ `open` transitions.

## Notes

- All product-specific facts (`preorder`, `releaseDate`, `noWithdrawal`, `backorder`) are **frozen at checkout** on the line. They are never re-read from the product catalogue at payment or ship time.
- The `defaulted: true` flag on a backorder promise means the 30-day default was used; a later catalogue date change must leave that group untouched.
- `noWithdrawal` lines (Art. 16 CRD — made-to-order / perishable) are always isolated into their own fulfillment order so the buyer can cancel the ordinary remainder without voiding the shop's bespoke work.
- `statusOfLines` treats an empty `lines` array as `closed` (everything moved to another fulfillment order, e.g. a lost-parcel re-assignment), not as `canceled`.
- The grouping key order is: shop-day → bespoke flag → cause → defaulted. This guarantees deterministic numbering (1 = ordinary open, 2 = bespoke open, then waiting groups by date).
- `checkShipLines` signals failure via the discriminated union return value, **not** by throwing.
