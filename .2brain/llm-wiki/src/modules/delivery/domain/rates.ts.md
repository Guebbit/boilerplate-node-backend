---
source: src/modules/delivery/domain/rates.ts
sha256: 3d99113aedc9f4e0aa8788b393cdfac53af45f9f7384cd56aa943d8e4aa4d190
generated_at: 2026-09-23T18:36:00.053213+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/rates.ts

## Purpose

Pure, side-effect-free shipping-rate logic kept in the delivery domain layer so that every quote in the system (checkout, delivery service, API responses) derives from a single static table. The module doubles as the source-of-truth schema for `GET /delivery/methods`.

## Key elements

- **`SHIPPING_METHODS`** — `readonly ShippingMethod[]` with three entries (`standard`, `express`, `pickup`). Flat prices; `standard` has a `freeAbove` threshold and a 30 kg cap; `express` is tracked, insured up to 500, capped at 5 kg; `pickup` is free, untracked, and has no weight ceiling.
- **`findShippingMethod(methodId)`** — Returns the method object for a given id, or `undefined`. Caller is responsible for handling absence.
- **`priceShipping(method, itemsTotal)`** — Returns `0` when `itemsTotal >= method.freeAbove`, otherwise the flat `method.price`.
- **`methodFitsWeight(method, weight)`** — Boolean check that `weight` falls within the method's `minWeight`/`maxWeight` bounds; an absent bound on either side is treated as open (no constraint).
- **`methodsForWeight(weight?)`** — Filters `SHIPPING_METHODS` to those whose weight range admits `weight`. If `weight` is `undefined`, returns the full array unfiltered.

## Relationships

- **`src/types/index.ts`** — Provides the `ShippingMethod` interface that this module imports and populates.
- **`src/modules/delivery/domain/index.ts`** — Barrel file; re-exports this module's public API to the rest of the delivery domain.
- **`src/modules/delivery/service.ts`** — Consumes `findShippingMethod`, `priceShipping`, and `methodsForWeight` to assemble delivery quotes and validate method/weight compatibility.
- **`src/modules/cart/services/checkout.ts`** — Calls into the delivery service (which uses these functions) to compute the shipping line during checkout.
- **`src/modules/delivery/tests/unit/rates.test.ts`** / **`rates.property.test.ts`** — Unit and property-based tests covering every exported function.
- **`src/modules/delivery/tests/integration/service.test.ts`** — Integration tests that exercise the service layer against this table.
- **`tests/cross-cutting/money-reconciliation.property.test.ts`** — Cross-cutting property tests that verify shipping charges reconcile correctly with order totals.

## Notes

- All money values are integer cents; `priceShipping` returns `number`, not a currency object.
- `pickup` intentionally omits `maxWeight` and `freeAbove`; `express` omits `freeAbove` and includes `maxInsuredValue`. Code consuming `ShippingMethod` must treat each optional field as "absent = unconstrained / not applicable," not as zero.
- The module is deliberately a static table, not a service. Adding dynamic rate logic (zones, carriers) would move the concern out of this file.
- `SHIPPING_METHODS` is `readonly`; treat it as an immutable constant, never mutate or reassign it.
