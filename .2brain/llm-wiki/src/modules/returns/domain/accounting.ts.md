---
source: src/modules/returns/domain/accounting.ts
sha256: 398138beb1eb7aefc821c6fcaa2291921ada47afbb64c557a5efa6425538fe82
generated_at: 2026-11-08T07:57:10.172341+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/accounting.ts

## Purpose

Pure domain logic that answers one question: *what has the order already settled?* It tallies which units are accounted for (canceled before shipping, or physically back) and how much delivery has already been refunded, so that a service settling a new return or cancellation can determine whether it takes the **last** unit and whether a delivery refund is still owed. Keeping the rule here, free of I/O, makes it unit-testable without a database.

## Key elements

- **`AccountedReturn`** (interface) – The read-model of a single return/cancellation as accounting sees it: `kind`, `status`, optional `remedy`, `lines` (product + quantity), and optional `shippingRefund`.
- **`OrderAccounts`** (interface) – The summary produced by `accountsOf`: `accountedFor` (settled units as `ProductQuantity[]`) and `shippingRefunded` (minor-unit string, summed).
- **`isSettled`** (module-private) – Decides whether a return's units count as settled. Cancellations always do; regular returns only when status is in `BACK_RETURN_STATUSES` **and** the buyer did not receive the units back via a repair or replacement (`handsUnitsBack`).
- **`accountsOf`** (exported function) – Filters an array of `AccountedReturn` down to settled ones, sums their shipping refunds in minor units via `addMoney`, and aggregates their lines via `wireLines` into an `OrderAccounts` object.

## Relationships

- **`src/domain-primitives/money.ts`** – Imports `addMoney`, `toMinorUnits`, `toDecimalString`, `NO_MONEY`. All monetary arithmetic in this file goes through these helpers to stay in integer minor units.
- **`./lifecycle`** – Imports `BACK_RETURN_STATUSES` (set of statuses that count as "back") and `handsUnitsBack` (predicate for repair/replacement) at runtime; imports `ReturnKind`, `ReturnRemedy`, `ReturnStatus` as types.
- **`./quantities`** – Imports `wireLines` (runtime) to normalise `AccountedReturn.lines` into `ProductQuantity[]`; imports `ProductQuantity` as a type.
- **`./index.ts`** – Barrel file; re-exports this module's public API for consumers within the returns domain.
- **`services/cancellation-refund.ts`**, **`services/receive.ts`** – Service-layer callers that use `accountsOf` to decide whether the current action settles the last unit and whether a delivery refund applies.
- **`tests/unit/domain.test.ts`** – Unit-tests `isSettled` and `accountsOf` directly.
- **`tests/contract/ownership-shop.contract.test.ts`** – Contract-level test that exercises the accounting rule end-to-end.

## Notes

- `isSettled` is deliberately **not exported**; the settlement rule is an internal detail. Callers interact only through `accountsOf`.
- `shippingRefund` on `AccountedReturn` is `string | undefined`. The code coerces absence to `0` before conversion (`toMinorUnits(shippingRefund ?? 0, …)`), so callers must not rely on the field being present.
- The `lines` field uses `{ toString(): string }` for `productId` rather than a plain `string`, allowing domain-specific ID types to be passed without widening.
- All money math is in **integer minor units** (via the `money.ts` primitives); the returned `shippingRefunded` is a decimal string in the order's currency. No floating-point arithmetic is performed here.
