---
source: src/modules/orders/domain/index.ts
sha256: 0f1fdccd0e2c54d043635901af04541068c9ce8871c3d8dd6371751bb456be02
generated_at: 2026-10-29T04:39:44.809509+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/index.ts

## Purpose

Barrel re-export for the orders domain layer. It exposes a single public surface for all pure business rules (totals, lifecycle, withdrawal, tax, etc.) so that consumers import from one path instead of reaching into individual domain files. The header contract states the layer is lint-guaranteed free of Express, Mongoose, and database concerns—anything testable without a DB lives behind this entry point.

## Key elements

- **Re-exports only** — no local definitions, types, or logic. Every symbol is forwarded from a sibling file in `./`.
- **Grouped by concern** with a one-line JSDoc per group (e.g. tax, withdrawal, fulfillment, lifecycle, timeline, CSV export, shop-time, status traits, projections, backorder, purchase-hold, deletion, rules, totals).
- **`ORDER_EVENTS` / lifecycle predicates** (`canTransition`, `isPayable`, `canProcessOrder`, `canShip`, `canRecordArrival`, `hasShopStarted`, `paymentSettled`, `statusesReachableFrom`, `statusesLeadingTo`, `orderActionsFor`, `canOverrideTo`, `overridableTargetsFrom`) — the full state-machine vocabulary, re-exported alongside the `OrderActor`/`OrderEvent`/`OrderEventName` types.
- **`ORDER_STATUS_TRAITS` / `statusesWhere`** — a total map of per-status traits and a query helper over it.
- **Type exports** (`DeletionCandidate`, `OwedLine`, `ShippableLineCandidate`, `OrderTaxBreakdown`, `WithdrawalCandidate`, `FulfillmentSummary`, `StampedPaymentStatus`, `StampedReturnStatus`, `TimelineEntryInput`, `OrderCsvColumn`, `OrderCsvSource`, etc.) — re-exported with `export type` semantics so downstream `verbatimModuleSyntax` users stay clean.

## Relationships

- **All fourteen sibling domain files** (`totals`, `deletion`, `purchase-hold`, `backorder`, `rules`, `lifecycle`, `tax`, `withdrawal`, `projections`, `fulfillment`, `status-traits`, `shop-time`, `timeline`, `export`) are the sole sources of every symbol re-exported here. This file adds no behavior; it only flattens their public APIs into one import path.
- **`src/modules/orders/controllers/get-order-item.ts`** — the one known controller-level consumer that reaches into the orders module; it imports domain predicates (e.g. from `lifecycle` or `rules`) through this barrel rather than directly from the individual files.

## Notes

- **No implementation here.** If you need to change a rule, edit the specific sibling file (e.g. `./lifecycle.ts`), not this barrel.
- **`ORDER_EVENTS` is intentionally "published for reading."** The JSDoc comment next to the lifecycle block clarifies that callers are expected to ask a named predicate (`isPayable`, `canProcessOrder`, …) rather than enumerate statuses or read the event table directly.
- **`AUTOMATIC_PURCHASE_HOLD_MAX_DAYS`** is a constant (not a function) exported from `./purchase-hold`; it is the only non-callable value in the entire barrel.
- The `NO_FULFILLMENT` sentinel from `./fulfillment` is likewise a value, not a function.
- Because this is the single entry point, adding a new domain concern requires a new sibling file **and** a re-export line here; omitting the re-export makes the symbol invisible to external consumers.
