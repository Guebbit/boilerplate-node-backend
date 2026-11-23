---
source: src/modules/orders/domain/index.ts
source_sha256: 86b559c799c9466cab69d3d47a2f8d81c25d871e1fdf8639634c0901f10b61ad
context_sha256: eb4d3904687b403396009d70fa6f3c3d3362efbf1c8e90bd36575ae1ee135b30
generated_at: 2026-11-22T06:11:51.567309+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/index.ts

## Purpose
Public barrel for the Orders domain layer. The domain layer holds pure rules only: no Express, no Mongoose, no tier dependencies (lint-enforced). Anything testable without a database belongs here. Queries, transactions, HTTP envelopes and translated copy do not. This file re-exports the domain's functions, constants and types so consumers import from one place.

## Key elements
The file contains no logic of its own, only re-exports grouped by sibling file:

- **`totals`**: `sumLineItems`, `orderTotal`.
- **`deletion`**: `hardDeletable`, `softDeletable`, type `DeletionCandidate`.
- **`purchase-hold`**: `AUTOMATIC_PURCHASE_HOLD_MAX_DAYS`, `purchaseHoldUntil`.
- **`backorder`**: `owedLineOf`, type `OwedLine`.
- **`rules`**: `buyerIdOf`, `checkOrderLines`, `isBuyer`, `isShippedItem`, `isDigitalOnlyOrder`, type `ShippableLineCandidate`.
- **`lifecycle`**: `ORDER_EVENTS`, `UNDELIVERABLE_EVENT`, `canTransition`, named status predicates (`isPayable`, `canProcessOrder`, `isAwaitingGoods`, `canShip`, `canRecordArrival`, `hasShopStarted`, `paymentSettled`), graph helpers (`statusesReachableFrom`, `statusesLeadingTo`), `orderActionsFor`, override helpers (`canOverrideTo`, `overridableTargetsFrom`), types `OrderActor`, `OrderEvent`, `OrderEventName`.
- **`tax`**: `orderTaxBreakdown`, `lineTaxFromRateTotals`, and the types `OrderTaxBreakdown`, `LineTaxBreakdown`, `TaxableLineItem`, `TaxRateSummary`. The VAT breakdown is shared by the order response and the invoice, both derived from frozen lines.
- **`billing`**: `canCorrectBilling`, `isSameBillingAddress`.
- **`withdrawal`**: right-of-withdrawal rules. These cover the window (`withdrawalClosesAt`, `withdrawUntilFrom`, `withdrawalRefundDueBy`, `WITHDRAWAL_REFUND_DAYS`, `WITHDRAWAL_SEND_BACK_DAYS`), eligibility (`canWithdraw`, `canCorrectAddress`, `isBeforeDispatch`, `isExcludedFromWithdrawal`, `withdrawalRefusalOf`, `withdrawalStartFor`) and conformity and delivery clocks (`conformityUntilFrom`, `repairedConformityUntil`, `deliveryClockFor`). It also exports candidate and clock types.
- **`projections`**: `paymentStatusOf`, `returnStatusOf` and their inverse filters `paymentStatusFilter`, `returnStatusFilter`, with the types `StampedPaymentStatus` and `StampedReturnStatus`. These describe the payment and return values stamped beside `status`.
- **`fulfillment`**: `NO_FULFILLMENT`, `fulfillmentStatusOf`, `fulfillmentStatusFilter`, `shipsAwaitedStock`, `settlementFor`, and the types `FulfillmentSummary`, `FulfillmentFilter`, `SettlementMove`. It covers what `delivery` reports about the goods and what `orders` reads from it.
- **`status-traits`**: `ORDER_STATUS_TRAITS`, `statusesWhere`, type `OrderStatusTraits`. Status meanings are declared once and are total over the contract's statuses.
- **`timeline`**: `TIMELINE_AUDIENCE`, `BUYER_VISIBLE_TYPES`, `isBuyerVisible`, and the timeline types.
- **`export`**: `ORDER_CSV_COLUMNS`, `toOrderCsvRow`, and the types `OrderCsvColumn`, `OrderCsvSource`.

## Relationships
- Re-exports from the 14 sibling domain files: `backorder`, `billing`, `deletion`, `export`, `fulfillment`, `lifecycle`, `projections`, `purchase-hold`, `rules`, `status-traits`, `tax`, `timeline`, `totals` and `withdrawal`.
- `src/modules/orders/controllers/get-order.ts` is a graph neighbor, so it sits in the dependency graph alongside this barrel. The file content does not show how it uses the barrel.

## Notes
- Sibling modules are meant to ask a named predicate from `lifecycle` (`isPayable`, `canProcessOrder`, ...) rather than list statuses or read the transition table. `ORDER_EVENTS` is exported only for reading.
- Types are re-exported with `export type`, separately from the values.
