---
source: src/modules/returns/domain/accounting.ts
sha256: cad77dec3190afe2446d834e669af7df4c7a7f2a4d0868898019c0333d20dcce
generated_at: 2026-10-15T11:52:13.119847+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/accounting.ts

## Purpose

Pure accounting helper that answers two questions for the return/cancellation flow: *which units of this order are already settled* (cancelled pre-ship or received back) and *how much delivery has already been refunded*. Keeping this logic in a side-effect-free module makes the "shipping is refunded by whichever cancel or return takes the **last** unit" rule unit-testable without a database.

## Key elements

- **`AccountedReturn`** (exported interface) — Minimal shape of a return as the accounting layer reads it: `kind`, `status`, `lines` (product/quantity), and an optional `shippingRefund` (present only when the return refunded delivery).
- **`OrderAccounts`** (exported interface) — The result of tallying: `accountedFor` (settled `ProductQuantity[]`) and `shippingRefunded` (delivery already refunded, in decimal units).
- **`isSettled`** (private) — Returns `true` for cancellations (always settled, "born closed") and for returns whose status is in `BACK_RETURN_STATUSES` (`received` or `closed`).
- **`accountsOf`** (exported function) — Filters a list of `AccountedReturn[]` (the order's returns *excluding* the one being processed), sums their `shippingRefund` in the given currency's minor units via `addMoney`, and flattens their lines into `wireLines`. Returns an `OrderAccounts` value.

## Relationships

- **`src/shared-kernel/money.ts`** — Provides `addMoney`, `toMinorUnits`, `toDecimalAmount`, and the `NO_MONEY` sentinel used for currency-safe arithmetic.
- **`src/modules/returns/domain/lifecycle.ts`** — Supplies `BACK_RETURN_STATUSES` (the settled-status set) and the `ReturnKind` / `ReturnStatus` types.
- **`src/modules/returns/domain/quantities.ts`** — Supplies `wireLines` (converts raw line arrays to `ProductQuantity[]`) and the `ProductQuantity` type.
- **`src/modules/returns/domain/index.ts`** — Barrel file; re-exports this module so services can import via the domain entry point.
- **`src/modules/returns/services/cancellation-refund.ts`** — Calls `accountsOf` to determine whether a new cancellation takes the last unit and thus the remaining delivery refund.
- **`src/modules/returns/services/receive.ts`** — Calls `accountsOf` when a return is received, to apply the same last-unit rule.
- **`src/modules/returns/tests/unit/domain.test.ts`** — Unit-tests `accountsOf` and the settled/last-unit logic in isolation.

## Notes

- Delivery is always summed in **minor units** (integer cents/pence/etc.) via `addMoney`; the decimal conversion happens only at the boundary in the return value. Never treat `shippingRefunded` as a float.
- `shippingRefund` on `AccountedReturn` is **optional** — it is absent for returns that did not include a delivery refund. `accountsOf` coalesces with `?? 0`.
- `isSettled` is intentionally **not exported**; external code should rely on `accountsOf` rather than re-implementing the settled check.
- The function accepts `returns` *excluding* the one currently being settled — callers are responsible for filtering it out before calling.
