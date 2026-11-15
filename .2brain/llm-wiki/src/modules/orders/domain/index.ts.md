---
source: src/modules/orders/domain/index.ts
sha256: dfabf5056eff72b7bf033b30303722728e8d7551fee39859928242445af54793
generated_at: 2026-11-14T20:34:45.783903+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/index.ts

## Purpose

Barrel (re-export) file for the orders **domain layer**. It aggregates the public API of every sibling domain module into a single import surface and, by its own doc comment, declares the invariant for the tier: pure rules only, with no Express, Mongoose, or any other framework/tier dependency. Consumers import from here rather than reaching into individual submodules.

## Key elements

- **`./totals`** — `sumLineItems`, `orderTotal`: arithmetic over order lines.
- **`./deletion`** — `hardDeletable`, `softDeletable`, type `DeletionCandidate`: guard predicates for deleting an order.
- **`./purchase-hold`** — `AUTOMATIC_PURCHASE_HOLD_MAX_DAYS`, `purchaseHoldUntil`: computes the hold deadline.
- **`./backorder`** — `owedLineOf`, type `OwedLine`: derives the owed quantity per line.
- **`./rules`** — `buyerIdOf`, `checkOrderLines`, `isBuyer`, `isShippedItem`, `isDigitalOnlyOrder`, type `ShippableLineCandidate`: small classification helpers used across controllers and emails.
- **`./lifecycle`** — `ORDER_EVENTS`, `UNDELIVERABLE_EVENT`, `canTransition`, `isPayable`, `canProcessOrder`, `isAwaitingGoods`, `canShip`, `canRecordArrival`, `hasShopStarted`, `paymentSettled`, `statusesReachableFrom`, `statusesLeadingTo`, `orderActionsFor`, `canOverrideTo`, `overridableTargetsFrom`, plus types `OrderActor`, `OrderEvent`, `OrderEventName`: the full state-machine / permission surface for order status changes.
- **`./tax`** — `orderTaxBreakdown`, `lineTaxFromRateTotals`, types `OrderTaxBreakdown`, `LineTaxBreakdown`, `TaxableLineItem`, `TaxRateSummary`: VAT breakdown derived from frozen lines.
- **`./withdrawal`** — `canCorrectAddress`, `canWithdraw`, `WITHDRAWAL_REFUND_DAYS`, `WITHDRAWAL_SEND_BACK_DAYS`, `isBeforeDispatch`, `conformityUntilFrom`, `repairedConformityUntil`, `deliveryClockFor`, `isExcludedFromWithdrawal`, `withdrawUntilFrom`, `withdrawalClosesAt`, `withdrawalRefundDueBy`, `withdrawalRefusalOf`, `withdrawalStartFor`, plus types `AddressCandidate`, `DeliveryClock`, `WithdrawalCandidate`, `WithdrawableLine`, `WithdrawalClockCandidate`: the buyer's right-of-withdrawal window and related deadlines.
- **`./projections`** — `paymentStatusOf`, `returnStatusOf`, `paymentStatusFilter`, `returnStatusFilter`, types `StampedPaymentStatus`, `StampedReturnStatus`: money/return values stamped beside `status` and their inverse filters.
- **`./fulfillment`** — `NO_FULFILLMENT`, `fulfillmentStatusOf`, `fulfillmentStatusFilter`, `shipsAwaitedStock`, `settlementFor`, types `FulfillmentSummary`, `FulfillmentFilter`, `SettlementMove`: delivery-side reporting and stock settlement.
- **`./status-traits`** — `ORDER_STATUS_TRAITS`, `statusesWhere`, type `OrderStatusTraits`: a single declared map of what each status means; total over the contract's statuses.
- **`./timeline`** — `TIMELINE_AUDIENCE`, `BUYER_VISIBLE_TYPES`, `isBuyerVisible`, types `OrderTimelineEntryAudience`, `OrderTimelineType`, `TimelineEntryInput`: audience gating for timeline entries.
- **`./export`** — `ORDER_CSV_COLUMNS`, `toOrderCsvRow`, types `OrderCsvColumn`, `OrderCsvSource`: column schema and row mapper for the orders CSV.

## Relationships

- **Re-exports (incoming):** Every sibling domain file in this directory (`backorder`, `deletion`, `export`, `fulfillment`, `lifecycle`, `projections`, `purchase-hold`, `rules`, `status-traits`, `tax`, `timeline`, `totals`, `withdrawal`) is the source of the symbols this file re-publishes. This file adds no logic.
- **Consumed by (outgoing):** `src/modules/orders/controllers/get-order.ts` and `src/modules/orders/emails.ts` are known importers that pull domain predicates/types through this barrel.

## Notes

- The file is a **pure re-export**; it contains no functions, classes, or side effects of its own. Any change to a domain rule must be made in the originating submodule, not here.
- The `./lifecycle` block carries an explicit convention: `ORDER_EVENTS` is published **for reading**; consumers must use the named predicates (`isPayable`, `canProcessOrder`, …) and must **not** enumerate statuses or read the event table directly.
- The tier boundary ("no Express, Mongoose, every tier") is described as **lint-guaranteed**, meaning a lint rule enforces it—don't rely on convention alone when adding imports.
