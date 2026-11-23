---
source: src/modules/returns/domain/accounting.ts
source_sha256: 398138beb1eb7aefc821c6fcaa2291921ada47afbb64c557a5efa6425538fe82
context_sha256: c400970ae5d604ed20a5ed141826362a0474e5b23eb7306d33e1af2d2f43e053
generated_at: 2026-11-22T07:22:40.316609+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/domain/accounting.ts

## Purpose
Pure accounting of which units of an order are already settled (canceled before shipping, or returned) and how much delivery has already been refunded. It exists so the rule "shipping is refunded by whichever cancel or return takes the LAST unit" can be tested without a database.

## Key elements
- `AccountedReturn` (interface): a return as the accounting reads it, with `kind`, `status`, optional `remedy`, `lines` (productId and quantity), and optional `shippingRefund` (a decimal string).
- `OrderAccounts` (interface): the result, holding `accountedFor` (a `ProductQuantity[]` of units canceled or back) and `shippingRefunded` (a summed decimal string).
- `isSettled` (module-private): a return counts as settled if it is a `cancellation`, or if its status is in `BACK_RETURN_STATUSES` and `handsUnitsBack` is false for it.
- `accountsOf(returns, currency)`: filters to the settled returns, sums their `shippingRefund` in minor units, and returns the `OrderAccounts`. The input must be every return on the order except the one being settled now.

## Relationships
- `src/modules/returns/domain/lifecycle.ts`: supplies `BACK_RETURN_STATUSES`, `handsUnitsBack`, and the `ReturnKind`, `ReturnRemedy` and `ReturnStatus` types.
- `src/modules/returns/domain/quantities.ts`: `wireLines` converts the settled returns' lines into `ProductQuantity` entries, and `ProductQuantity` is the type of `accountedFor`.
- `src/domain-primitives/money.ts`: `toMinorUnits`, `addMoney`, `toDecimalString` and `NO_MONEY` do the delivery summing in minor units rather than floats.
- `src/modules/returns/services/cancellation-refund.ts` and `src/modules/returns/services/receive.ts`: neighbors in the dependency graph, most likely consumers that use the tally when a cancel is made or a return is received. The file itself does not show this.
- `src/modules/returns/domain/index.ts`: a neighbor in the graph, likely the domain barrel. The file does not show this.
- `src/modules/returns/tests/unit/domain.test.ts` and `tests/contract/ownership-shop.contract.test.ts`: neighbors in the graph, presumably test coverage of this logic.

## Notes
- Cancellations are always treated as settled, since they are "born closed".
- A return with a repair or replacement remedy settles no units and refunds no delivery, because the goods stay with the buyer. This check is delegated to `handsUnitsBack`.
- A missing `shippingRefund` counts as 0.
