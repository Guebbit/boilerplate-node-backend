---
source: src/modules/delivery/domain/fulfillment.ts
sha256: 1b1c4d290090c6ee7f8377f6f2e8744d1d87e7bfaec447de08b8c65f5f4202fb
generated_at: 2026-11-08T05:28:19.463403+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/fulfillment.ts

## Purpose

Pure domain rules that turn an order's frozen lines into fulfillment-order drafts, derive a fulfillment order's status from its lines and hold state, and validate which lines a shipment may carry. Exists so that the grouping, status, and shipment-validation logic is fully testable in isolation, with no database or infrastructure dependency.

## Key elements

- **`WaitCause`** (`'preorder' | 'backorder'`) — why a fulfillment order is held for stock.
- **`FulfillmentLine`** — a product on a stored fulfillment order with `quantity`, `shippedQuantity`, `canceledQuantity`.
- **`GroupableLine`** — a line as read from the order's frozen snapshot; carries `ships`, optional `preorder`, `releaseDate`, `noWithdrawal`, and `backorder` metadata.
- **`FulfillmentOrderDraft`** — a fulfillment order as the grouping rule produces it (before persistence), including `kind`, `status`, `holdReason`, `agreedAt`, `expectedAt`, `cause`, `defaulted`.
- **`remainingOfLine` / `remainingOf`** — compute outstanding units for a single line or a whole set of lines.
- **`groupOrderLines(lines, timeZone)`** — the core splitting rule: partitions lines into one "ships now" ordinary group, one "ships now" bespoke (`noWithdrawal`) group, and one `on_hold` group per (shop-day × cause × bespoke × defaulted) bucket. Returns numbered `FulfillmentOrderDraft[]`.
- **`statusOfLines(lines, held)`** — derives `open` / `in_progress` / `on_hold` / `closed` / `canceled` from remaining quantities, shipment history, and hold flag.
- **`ProductQuantity`** / **`ShipLinesVerdict`** — input/output shapes for shipment validation.
- **`checkShipLines(lines, requested?)`** — validates a staff shipment request against remaining quantities; undefined/empty request means "ship everything that remains". (Truncated in source.)
- **Internal:** `partsOf` (splits a line into ready + waiting parts), `promisedAt` (max date across a waiting group), `kindOf` (physical vs digital), `toFulfillmentLine` (maps to a zero-shipped/canceled line).

## Relationships

- **`src/domain-primitives/time.ts`** — imports `dayInZone`; used inside `groupOrderLines` to bucket waiting lines by shop calendar day before grouping by cause/defaulted flag.
- **`src/modules/delivery/domain/index.ts`** — barrel for the delivery domain; re-exports this file's public types and functions so consumers can import from the domain root.
- **`src/modules/delivery/services/fulfill.ts`** — the service that calls `groupOrderLines` at payment time and `checkShipLines` when a shipment is cut; receives the drafts and persists them via the repository.
- **`src/modules/delivery/services/cut.ts`** — uses `remainingOfLine` / `remainingOf` to know how many units a shipment can carry.
- **`src/modules/delivery/services/cancel-remainder.ts`** — reads `remainingOf` to determine what is left to cancel.
- **`src/modules/delivery/presenter.ts`** — maps `FulfillmentOrderDraft` / stored fulfillment orders into view-model shapes for the UI.
- **`src/modules/delivery/repository.ts`** — persists the drafts produced by `groupOrderLines` and the status updates produced by `statusOfLines`.
- **`src/modules/delivery/model.ts`** — defines the stored persistence shape that `FulfillmentOrderDraft` maps into.

## Notes

- **`defaulted` flag on backorder groups.** When a backorder's `promisedAt` comes from the 30-day catalogue default (`dated: false`), the draft is tagged `defaulted: true`. Downstream logic must skip updating `expectedAt` for these groups when the catalogue default changes — only catalogue-named dates are eligible for re-dating.
- **`noWithdrawal` (Art. 16 CRD) lines are always split into their own fulfillment order.** This is deliberate: it lets a buyer cancel the ordinary remainder without inadvertently cancelling bespoke/perishable goods the shop is already working on.
- **Digital lines ride with the physical group.** `kindOf` returns `physical` if *any* line ships; a mixed group is one physical fulfillment order, not separate digital and physical ones.
- **`statusOfLines` with zero lines** returns `closed`, not `canceled`. This covers the lost-parcel case where all units have been re-attached to another fulfillment order.
- **Grouping key order:** shop-day → bespoke flag → cause → defaulted. The bespoke bit (0/1) is inserted *before* cause so that, for the same day, the ordinary group always sorts ahead of the bespoke one, matching the "cancel the rest on its own" requirement.
