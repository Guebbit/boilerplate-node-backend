---
source: src/modules/orders/domain/index.ts
sha256: ab18964b3250fd4e8967e0e77ff8740f965d8c24cf2f4fa0d4d0137f0ad597b6
generated_at: 2026-11-08T06:48:53.858260+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/index.ts

## Purpose

Barrel re-export for the orders domain layer. Aggregates every pure business rule (totals, lifecycle transitions, tax, withdrawal, etc.) behind a single import path so consumers never reach into individual domain files. The module doc block and a lint rule guarantee it contains no Express, Mongoose, or other infrastructure dependencies.

## Key elements

- **Totals** – `sumLineItems`, `orderTotal` (from `./totals`).
- **Deletion** – `hardDeletable`, `softDeletable`, type `DeletionCandidate` (from `./deletion`).
- **Purchase hold** – `AUTOMATIC_PURCHASE_HOLD_MAX_DAYS`, `purchaseHoldUntil` (from `./purchase-hold`).
- **Backorder** – `owedLineOf`, type `OwedLine` (from `./backorder`).
- **Rules** – `buyerIdOf`, `checkOrderLines`, `isBuyer`, `isShippedItem`, `isDigitalOnlyOrder`, type `ShippableLineCandidate` (from `./rules`).
- **Lifecycle** – `ORDER_EVENTS`, `UNDELIVERABLE_EVENT`, `canTransition`, `isPayable`, `canProcessOrder`, `isAwaitingGoods`, `canShip`, `canRecordArrival`, `hasShopStarted`, `paymentSettled`, `statusesReachableFrom`, `statusesLeadingTo`, `orderActionsFor`, `canOverrideTo`, `overridableTargetsFrom`, types `OrderActor`, `OrderEvent`, `OrderEventName` (from `./lifecycle`).
- **Tax** – `orderTaxBreakdown`, `lineTaxFromRateTotals`, types `OrderTaxBreakdown`, `LineTaxBreakdown`, `TaxableLineItem`, `TaxRateSummary` (from `./tax`).
- **Withdrawal** – `canCorrectAddress`, `canWithdraw`, `isBeforeDispatch`, `conformityUntilFrom`, `repairedConformityUntil`, `deliveryClockFor`, `isExcludedFromWithdrawal`, `withdrawUntilFrom`, `withdrawalClosesAt`, `withdrawalRefusalOf`, `withdrawalStartFor`, and five associated types (from `./withdrawal`).
- **Projections** – `paymentStatusOf`, `returnStatusOf`, `paymentStatusFilter`, `returnStatusFilter`, types `StampedPaymentStatus`, `StampedReturnStatus` (from `./projections`).
- **Fulfillment** – `NO_FULFILLMENT`, `fulfillmentStatusOf`, `fulfillmentStatusFilter`, `shipsAwaitedStock`, types `FulfillmentSummary`, `FulfillmentFilter` (from `./fulfillment`).
- **Status traits** – `ORDER_STATUS_TRAITS`, `statusesWhere`, type `OrderStatusTraits` (from `./status-traits`).
- **Timeline** – `TIMELINE_AUDIENCE`, `isBuyerVisible`, types `OrderTimelineEntryAudience`, `OrderTimelineType`, `TimelineEntryInput` (from `./timeline`).
- **CSV export** – `ORDER_CSV_COLUMNS`, `toOrderCsvRow`, types `OrderCsvColumn`, `OrderCsvSource` (from `./export`).

## Relationships

This file **re-exports** (one-way) from every sibling domain module: `backorder`, `deletion`, `export`, `fulfillment`, `lifecycle`, `projections`, `purchase-hold`, `rules`, `status-traits`, `tax`, `timeline`, `totals`, `withdrawal`. It introduces no new logic; any change in a sibling that renames or removes an export must be mirrored here. Consumers (controllers, email templates, other services) import from this file rather than the individual modules.

## Notes

- **Purity contract enforced by lint.** The module doc comment states it is "lint-guaranteed free of Express, Mongoose and every tier." Adding a runtime import of a framework package will fail the build.
- **Lifecycle usage pattern.** `ORDER_EVENTS` and the status table are exported for *reading*; callers are expected to use the named predicates (`isPayable`, `canProcessOrder`, …) rather than enumerating statuses themselves.
- **No own logic.** This file is purely a re-export surface. Unit tests target the individual sibling modules, not this barrel.
- **Grouping by concern.** Exports are ordered by business concept (money → deletion → hold → backorder → rules → lifecycle → tax → withdrawal → projections → fulfillment → traits → timeline → export), not alphabetically. New exports should be placed in the matching conceptual block.
