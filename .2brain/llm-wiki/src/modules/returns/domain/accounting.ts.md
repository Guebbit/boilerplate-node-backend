---
source: src/modules/returns/domain/accounting.ts
sha256: 0ad014f7795e7aef8b1ba684c43c9f118a61e2d300c1c67e0e03b2892a45fcb9
generated_at: 2026-10-29T05:37:01.192906+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/accounting.ts

## Purpose

Pure accounting logic that determines which order units are already settled (cancelled pre-ship or returned) and how much delivery has been refunded. It lets the "shipping is refunded by whichever cancel or return takes the last unit" rule be evaluated and tested without a database.

## Key elements

- **`AccountedReturn`** (interface) – A return/cancellation expressed in terms accounting cares about: kind, status, remedy, line items, and any `shippingRefund` amount.
- **`OrderAccounts`** (interface) – The aggregate result: `accountedFor` (settled units as `ProductQuantity[]`) and `shippingRefunded` (delivery already refunded, in decimal major units).
- **`isSettled`** (private) – Decides whether a given `AccountedReturn` counts. Cancellations are always settled. Returns settle only when status is in `BACK_RETURN_STATUSES` *and* the buyer did **not** get the units back (repair/replacement).
- **`accountsOf(returns, currency)`** (export) – Filters to settled returns, sums their `shippingRefund` via minor-unit money arithmetic, and flattens line items into `ProductQuantity[]`. Returns an `OrderAccounts`.

## Relationships

- **`@domain-primitives/money`** – Uses `NO_MONEY`, `addMoney`, `toMinorUnits`, `toDecimalAmount` for float-safe currency arithmetic.
- **`./lifecycle`** – Imports `BACK_RETURN_STATUSES` and `handsUnitsBack` to gate settlement; imports `ReturnKind`, `ReturnRemedy`, `ReturnStatus` types.
- **`./quantities`** – Imports `wireLines` to normalise line items into `ProductQuantity[]`; imports the `ProductQuantity` type.
- **`./index.ts`** – Barrel re-exports this module's public API.
- **`../services/cancellation-refund.ts`** and **`../services/receive.ts`** – Call `accountsOf` to determine whether the current operation claims the last unit and triggers a delivery refund.
- **`../tests/unit/domain.test.ts`** – Unit-tests the settlement and tallying logic.
- **`tests/contract/ownership-shop.contract.test.ts`** – Exercises the accounting rule end-to-end across ownership and shop flows.

## Notes

- `accountsOf` expects the caller to **exclude** the return currently being settled from the input array; it does not filter that out itself.
- `AccountedReturn.lines[].productId` is typed as `{ toString(): string }` rather than a plain `string`, so both raw string IDs and wrapper objects (e.g. ObjectId) are accepted.
- `shippingRefund` is optional and may be absent when a return refunded no delivery; the code coalesces with `?? 0` before converting.
- All money work goes through minor-unit integers internally; the public `shippingRefunded` field is in decimal major units.
