---
source: src/modules/delivery/tests/unit/lost.test.ts
sha256: beefa840c23f961237c766e1ff3a653b48fcef5ae5da11b8338853fc9957a1ee
generated_at: 2026-11-08T05:46:06.711515+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/lost.test.ts

## Purpose

Unit tests for the pure domain arithmetic around a **lost parcel**: how the loss mutates the origin fulfillment order's lines (`withLoss`), when a later "turn-up" is allowed to be recorded (`planRestoration`), how the restoration re-applies to those lines (`withRestoration`), how a lost shipment is reported in summaries (`summarize`), and how the owed-shipment date is computed (`owedDateOf`). The file exists to pin down invariants—floor-at-zero, all-or-nothing eligibility, exact inverse of `withLoss`/`withRestoration`—without touching any service or I/O layer.

## Key elements

- **`line(productId, quantity, fields?)`** – test helper that builds a `FulfillmentLine` with `shippedQuantity: 0` and `canceledQuantity: 0` unless overridden.
- **`shipment(...units)`** – test helper producing a `LostShipmentFacts` (id `s1`, fulfillmentOrderId `fo1`) from `[productId, qty]` pairs.
- **`origin(lines)` / `owedOrder(lines)`** – test helpers building `RestorableFulfillmentOrder` fixtures (origin order `fo1`; owed order `fo2` linked via `sourceShipmentId: 's1'`).
- **`describe('withLoss', …)`** – verifies subtraction of lost units from `shippedQuantity`/`quantity`, that untouched lines are preserved, that a fully-owed line is dropped and `statusOfLines` reports `'closed'`, and that quantities never go below zero.
- **`describe('planRestoration', …)`** – verifies the eligibility gate: allowed when the shelf portion is open and nothing was owed; allowed when owed units are all still unshipped/uncanceled; counts owed units across multiple split-off orders; **returns `undefined`** (not throws) when the origin has shipped, canceled, is missing, or any owed unit has moved.
- **`describe('withRestoration', …)`** – verifies the line-level write-back: re-ships units, pulls owed units back onto the origin, restores a previously-dropped line using the shipment's title, and confirms it is an **exact inverse** of `withLoss`.
- **`describe('summarize …')`** – confirms a lost shipment counts as `shipped: true` but `undelivered: 0`.
- **`describe('owedDateOf', …)`** – checks latest-future-restock-date selection, fallback to the default promise window (30 days) when a product has no future date or its date is already past, and the `defaulted` flag.

## Relationships

- **`src/modules/delivery/domain/index.ts`** – sole import target; provides all six tested functions (`withLoss`, `withRestoration`, `planRestoration`, `summarize`, `owedDateOf`, `statusOfLines`) and the three types (`FulfillmentLine`, `LostShipmentFacts`, `RestorableFulfillmentOrder`).
- **`src/modules/delivery/domain/lost.ts`** – expected implementation home for `withLoss`, `withRestoration`, and `planRestoration` (the core subject of this file).
- **`src/modules/delivery/domain/fulfillment.ts`** – expected implementation home for `statusOfLines`, `summarize`, `owedDateOf`, and the shared types.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** – sibling test file exercising the other domain functions; shares the same helper patterns and import path.
- **`src/modules/delivery/services/lost.ts`** – the service layer that would call these domain functions in production; this test deliberately bypasses it to keep the tests pure.

## Notes

- **`planRestoration` signals rejection with `undefined`, not an exception.** Tests assert `toBeUndefined()` for every ineligible case. Callers in the service layer must null-check.
- **All-or-nothing invariant:** a single shipped or canceled unit on the origin *or* on any owed order invalidates the entire restoration plan, even for other products. This is a deliberate design choice, not a per-line check.
- **Inverse guarantee:** the `undoes withLoss exactly` test is the strongest contract in the file—any refactor of `withLoss` or `withRestoration` must keep them exact inverses.
- **No mocks, no async, no service imports.** The file is intentionally self-contained at the domain level; it will not catch integration regressions in `services/lost.ts` or the cut/fulfill/digest pipeline.
- **`owedDateOf` treats a past date identically to `undefined`**—both trigger the default-window fallback and set `defaulted: true`.
