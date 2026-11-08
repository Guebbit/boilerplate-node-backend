---
source: src/modules/orders/domain/backorder.ts
sha256: 54697dee51f612c392e6b8c4fd7ccc6fd4e5518d6fe1e99c4c36bdd294d24bb2
generated_at: 2026-11-08T06:48:03.691700+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/backorder.ts

## Purpose

Defines the "owed" portion of an order line — how many units are backordered and when the buyer was promised delivery. Pure domain logic: it computes a frozen snapshot at order-placement time so that later catalogue changes (e.g. restock-date edits) don't silently alter what was already promised to the buyer.

## Key elements

- **`OwedLine`** (interface) — The frozen owed-part of one order line. Carries `backorderedQuantity` (units the shelf couldn't cover), `promisedAt` (the delivery promise date), and `promiseDated` (whether that date came from the product's restock date vs. the 30-day default).
- **`owedLineOf`** (function, pure) — Given the uncovered quantity, an optional restock date, the placement instant, and the default promise days, returns an `OwedLine` or `undefined` (when nothing is owed). The promise date is the restock date when one exists; otherwise `placedAt + promiseDays × DAY_MS`.

## Relationships

- **`src/domain-primitives/time.ts`** — Imports `DAY_MS` to convert the `promiseDays` parameter into milliseconds when computing the default promise date.
- **`src/modules/orders/domain/index.ts`** — Barrel/re-export file for the orders domain; makes `OwedLine` and `owedLineOf` available to consumers of the domain module.
- **`src/modules/orders/services/place.ts`** — Caller in the order-placement service; invokes `owedLineOf` to freeze the owed portion of each line before persisting the order.
- **`src/modules/delivery/tests/factories.ts`** — Test factory that constructs `OwedLine`-shaped fixtures for delivery-related test suites.

## Notes

- `promiseDated` is the critical flag: it records *why* a specific date was chosen. If the restock date in the catalogue is later changed, only promises where `promiseDated` is `true` are eligible to shift; `false` promises stay anchored to the original 30-day calculation.
- The function returns `undefined` (not a zero-quantity object) when `owed === 0`, so callers must guard against absence rather than checking a quantity of zero.
- `promiseDays` is not a constant here — it is injected by the caller (`shop`'s `BACKORDER_PROMISE_DAYS`), keeping the domain function parameterised and testable.
