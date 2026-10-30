---
source: src/modules/orders/domain/backorder.ts
sha256: 54697dee51f612c392e6b8c4fd7ccc6fd4e5518d6fe1e99c4c36bdd294d24bb2
generated_at: 2026-10-29T04:39:27.432025+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/backorder.ts

## Purpose

Pure domain logic that defines and computes the "owed" portion of an order line—the units the shelf could not cover and the date they were promised to the buyer. It exists to keep the backorder calculation free of I/O and service concerns, living alongside other order domain types.

## Key elements

- **`OwedLine`** (interface) — the frozen owed part of one order line: `backorderedQuantity` (number), `promisedAt` (Date), and `promiseDated` (boolean, true when the promise is the product's restock date rather than the default window).
- **`owedLineOf(owed, restockDate, placedAt, promiseDays)`** — returns an `OwedLine` when `owed > 0`, or `undefined` when the shelf covered everything. The promise date is the restock date if one exists, otherwise `placedAt + promiseDays * DAY_MS`.

## Relationships

- **`src/domain-primitives/time.ts`** — provides the `DAY_MS` constant used to convert the default promise window from days to milliseconds.
- **`src/modules/orders/domain/index.ts`** — barrel file that re-exports `OwedLine` and `owedLineOf` so the rest of the codebase can import from the module root.
- **`src/modules/orders/services/place.ts`** — the order-placement service that calls `owedLineOf` to freeze each line's owed quantity and promise at the moment of ordering.
- **`src/modules/delivery/tests/factories.ts`** — test factory that constructs `OwedLine` values for delivery-related tests.

## Notes

- The function is intentionally total-undefined on the "not owed" path (returns `undefined` rather than an object with zero quantity). Callers must handle the optional return.
- `promiseDated` is informational only; it records *which* source produced `promisedAt` (catalogue restock date vs. default window) so downstream display logic can phrase the message correctly ("by \<date\>" vs. "within 30 days"). It does not affect the date value itself.
- The module is pure: no side effects, no I/O. All inputs are passed explicitly, including `promiseDays` (sourced from the shop's `BACKORDER_PROMISE_DAYS` config at the call site).
