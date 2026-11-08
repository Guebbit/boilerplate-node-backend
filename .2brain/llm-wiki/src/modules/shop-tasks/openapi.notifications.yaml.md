---
source: src/modules/shop-tasks/openapi.notifications.yaml
sha256: 29a271a7e08391ec603ee54298d8c174684316a6278b8c29dc0161480ffe266b
generated_at: 2026-11-08T08:15:40.357750+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/openapi.notifications.yaml

## Purpose

An OpenAPI 3.1.0 contract fragment that extends the core `Notification` schema with shop-specific notification variants (buyer-facing order/stock events and staff work-queue notices). It exists so that a project *with* a shop gets these additional `oneOf` members, while a project *without* one carries only the five base notices and never sees them.

## Key elements

- **`x-extends: Notification`** — Custom keyword that appends 19 notification schemas to the base `Notification` (`oneOf` + `discriminator.mapping`). Buyer codes: `shop-tasks.fulfillment-held`, `.shipment-lost`, `.stock-alert`, `.fulfillment-delayed`, `.cart-line-removed`, `.wishlist-item-removed`, `.cart-merge-refused`. Staff codes: `shop-tasks.staff.purchase-hold-placed`, `.return-requested`, `.transfers-due`, `.preorders-late`, `.delivery-holds-open`, `.withdrawals-awaiting-goods`, `.returns-undecided`, `.low-stock`, `.unshipped`, `.awaiting-tracking`, `.undelivered`, `.stale-refunds`.
- **`ProductTitles`** — `Record<locale, string>`; denormalised product names embedded in notifications so the reader still sees a localised title if the product is later deleted.
- **Param schemas** (`FulfillmentHeldParams`, `ShipmentLostParams`, `FulfillmentDelayedParams`, `CartLineRemovedParams`, `CartMergeRefusedParams`) — the `params` payload each notification carries; all use `additionalProperties: false` and reference `Id` from the shared root contract.
- **Notification schemas** (`NotificationFulfillmentHeld`, `NotificationShipmentLost`, `NotificationStockAlert`, `NotificationFulfillmentDelayed`, `NotificationCartLineRemoved`, …) — each is a flat object with `id`, `audience`, `code` (single-value enum), `params`, `severity`, optional `readAt`, and `createdAt`. They reference `NotificationAudience` and `NotificationSeverity` from `../notifications/openapi.yaml`.

## Relationships

- **`../notifications/openapi.yaml`** (core contract, not a listed neighbor but referenced) — Provides the base `Notification` type, `NotificationAudience`, and `NotificationSeverity` that this fragment extends.
- **`../../../shared/contracts/openapi.root.yaml`** — Source of the shared `Id` schema referenced by every param/notification schema.
- **`src/modules/shop-tasks/asyncapi.notifications.yaml`** — The AsyncAPI counterpart describing the *event* (message) side of the same notifications; this file defines the *schema* (shape) side.
- **`src/modules/shop-tasks/module.ts`** — Module entry point that registers/wires this OpenAPI fragment into the shop-tasks module's contract bundle.

## Notes

- `x-extends` is a **custom** keyword (not standard OpenAPI). Consumers must implement merge logic that appends the listed schemas to `Notification`'s `oneOf` and `discriminator.mapping`. See `docs/api/contract-fragmentation.md#extending-another-modules-contract`.
- The `notifications` module **never names** these schemas directly; it only ships its own five. If a project omits the shop-tasks module, these variants simply don't exist.
- Date fields (`agreedAt`, `expectedAt`) are "a day on the shop's calendar (`Shop.timeZone`)" — **not** UTC; don't parse them as timestamps.
- `message` fields (max 500 chars) are **staff-authored** buyer-facing text. `FulfillmentHeldParams.notice` is a closed enum (`check_address` | `delayed`) and deliberately **excludes** the staff's internal reason.
- All schemas are `additionalProperties: false`; adding fields is a breaking change to the contract.
- The file content provided here is truncated; the full set of staff notification schemas (e.g. `NotificationStaffLowStock`) is present in the real file but not visible in the excerpt.
