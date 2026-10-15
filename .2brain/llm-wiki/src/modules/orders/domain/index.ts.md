---
source: src/modules/orders/domain/index.ts
sha256: a19dd98e2864ac9f9e9d9d16282a0f7e21fc82d5bf20573ded6ebbb6ba28894c
generated_at: 2026-10-15T11:01:35.944564+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/index.ts

## Purpose

Barrel re-export for the orders domain layer. It aggregates the public surface of all pure, framework-free order rules (totals, lifecycle, tax, withdrawal, fulfillment, etc.) into a single import path. The file itself contains no logic; its role is to define the boundary: everything exported here must be testable without a database, Express, or Mongoose.

## Key elements

- **`totals`** – `sumLineItems`, `orderTotal`: arithmetic on line items.
- **`rules`** – `checkOrderLines`, `isShippedItem`, `isDigitalOnlyOrder`, type `ShippableLineCandidate`: validation and classification of order lines.
- **`lifecycle`** – `ORDER_EVENTS` (the canonical transition table), plus derived helpers `canTransition`, `isPayable`, `paymentSettled`, `statusesReachableFrom`, `statusesLeadingTo`, `orderActionsFor`, `canOverrideTo`, `overridableTargetsFrom`; types `OrderActor`, `OrderEvent`, `OrderEventName`.
- **`tax`** – `orderTaxBreakdown`, `lineTaxFromRateTotals`; types `OrderTaxBreakdown`, `LineTaxBreakdown`, `TaxableLineItem`, `TaxRateSummary`.
- **`transfer-reference`** – `buildReference`, `parseReference`: mint/parse the RF creditor reference for `bank_transfer` orders.
- **`withdrawal`** – `canWithdraw`, `isBeforeDispatch`, `isExcludedFromWithdrawal`, `withdrawUntilFrom`, `withdrawalStartFor`; types `WithdrawalCandidate`, `WithdrawableLine`, `WithdrawalClockCandidate`.
- **`projections`** – `paymentStatusOf`, `returnStatusOf`, `paymentStatusFilter`, `returnStatusFilter`; types `StampedPaymentStatus`, `StampedReturnStatus`.
- **`fulfillment`** – `NO_FULFILLMENT`, `fulfillmentStatusOf`, `fulfillmentStatusFilter`, `shipsAwaitedStock`; types `FulfillmentSummary`, `FulfillmentFilter`.
- **`status-traits`** – `ORDER_STATUS_TRAITS`, `statusesWhere`; type `OrderStatusTraits`.
- **`shop-time`** – `yearInZone`, `zonedStartOfDay`: shop-calendar helpers for numbered series.
- **`timeline`** – `TIMELINE_AUDIENCE`, `isBuyerVisible`; types `TimelineAudience`, `TimelineEntryInput`.
- **`export`** – `ORDER_CSV_COLUMNS`, `toOrderCsvRow`; types `OrderCsvColumn`, `OrderCsvSource`.

## Relationships

- **Re-exports from (all domain siblings):** `totals.ts`, `rules.ts`, `lifecycle.ts`, `tax.ts`, `transfer-reference.ts`, `withdrawal.ts`, `projections.ts`, `fulfillment.ts`, `status-traits.ts`, `shop-time.ts`, `timeline.ts`, `export.ts`. This file is the sole public surface; consumers import through it rather than reaching into individual modules.
- **Consumed by (orders module entry points):** `src/modules/orders/index.ts` and `src/modules/orders/presenter.ts` import domain symbols from here. `src/modules/orders/emails.ts` also pulls domain types/values through this barrel.

## Notes

- The module docstring states the contract: anything exported must be free of Express, Mongoose, and "every tier" beyond domain. A lint rule enforces this.
- `ORDER_EVENTS` is declared the single source of truth for state transitions; all `canTransition` / `statusesLeadingTo` / `statusesReachableFrom` helpers are derived from it. Treat it as the canonical transition table when adding a new status or event.
- Tax breakdown is described as deriving from an order's *frozen* lines—i.e., the line items captured at order time, not mutable post-hoc values.
- The file is a pure re-export; there is no local state, no side effects, and no logic to unit-test here. Tests target the individual sibling modules.
- See `docs/theory/domain-layer.md` (referenced in the module docstring) for the broader architectural rationale.
