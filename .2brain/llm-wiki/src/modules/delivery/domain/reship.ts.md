---
source: src/modules/delivery/domain/reship.ts
sha256: 4b6472d8f727880748042b69f3a70080c1dcc686db8db084ca3d366a24a68700
generated_at: 2026-11-08T05:29:39.948175+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/reship.ts

## Purpose

Pure domain logic that decides which fulfillment orders must reopen when a customer returns delivered goods and a replacement is resent (legal-guarantee replacement), and how to distribute the "owed" portion (the part the shelf could not cover) across those reopened orders. Extracted as side-effect-free functions so every case is testable in isolation.

## Key elements

- **`ReopenableFulfillmentOrder`** (interface) — minimal view of a fulfillment order the planner needs: `id`, `physical` (bool; digital orders are excluded), `number` (position among the order's fulfillment orders), and `lines`.
- **`Reopening`** (interface) — the output unit: which fulfillment order gives back which `ProductQuantity[]`.
- **`planReopening(orders, needed)`** — allocates the `needed` units across physical fulfillment orders, latest-shipped first (descending `number`). Returns `Reopening[]` on success or **`undefined`** if the order never shipped enough units.
- **`shareOwed(reopenings, owed)`** — distributes the `owed` units over the reopenings, capping each fulfillment order's contribution at the quantity it actually reopened. Returns a `Map<string, ProductQuantity[]>`.

## Relationships

- **`./fulfillment`** — source of the `FulfillmentLine` and `ProductQuantity` types used throughout this module.
- **`./index.ts`** — barrel file; re-exports these symbols for the rest of the delivery module.
- **`../services/reship.ts`** — service-layer caller that invokes `planReopening` / `shareOwed` and persists the result.
- **`../../tests/unit/reship.test.ts`** — unit tests exercising both exported functions across edge cases (insufficient stock, multi-product, digital-only orders, etc.).
- **`../../tests/unit/fulfillment.test.ts`** — tests the `FulfillmentLine` / `ProductQuantity` shapes this module depends on.

## Notes

- `planReopening` signals "not enough shipped" by returning `undefined`, **not** an empty array. Callers must branch on it.
- Ordering is by the `number` field in **descending** order (latest shipped first). This is the business rule: the most recent parcel is unwound first.
- `shareOwed` is capped per fulfillment order by the units it reopened, so a line can never be asked to give back more than it actually returned.
- Uses `Array.prototype.toSorted` (non-mutating) — requires a runtime/target that supports ES 2023 array methods.
- The module is deliberately free of imports from the services or data-access layers; it only depends on the type definitions in `fulfillment.ts`.
