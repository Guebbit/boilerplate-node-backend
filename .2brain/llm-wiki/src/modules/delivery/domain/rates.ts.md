---
source: src/modules/delivery/domain/rates.ts
sha256: cb94fc315b9ab4f01c19e2e73ac819b84665557a880e06bd1840de096a7b939d
generated_at: 2026-09-27T14:49:52.359351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/rates.ts

## Purpose

Pure, side-effect-free shipping-rate logic over a static three-method table. It lives in the `domain/` layer so that every consumer—checkout, the delivery service, tests—derives quotes from exactly one place. `ShippingMethod` (the API schema) is this table plus a runtime `currency` field the service stamps on per call.

## Key elements

- **`StaticShippingMethod`** — `Omit<ShippingMethod, 'currency'>`. The table's row shape; `currency` is deliberately excluded because it's live deployment config, not a per-method constant.
- **`SHIPPING_METHODS`** — `readonly` array of three methods (`standard`, `express`, `pickup`). Flat rates; the only dimensional constraint is `maxWeight` (and `minWeight` where present). `pickup` has no weight ceiling and no address requirement.
- **`findShippingMethod(methodId)`** — returns the method or `undefined`; caller decides how to handle absence.
- **`priceShipping(method, itemsTotal)`** — returns `0` if `itemsTotal >= method.freeAbove`, otherwise the flat `method.price`.
- **`methodFitsWeight(method, weight)`** — checks the basket weight against `minWeight`/`maxWeight`; an absent bound is open, not zero.

## Relationships

- **`src/types/index.ts`** — imports the `ShippingMethod` type from `@types`; this file re-exports a narrower `StaticShippingMethod` derived from it.
- **`src/modules/delivery/service.ts`** — consumes `SHIPPING_METHODS` and the pure helpers; its `listMethods` stamps the runtime `currency` onto each row before responding to `GET /delivery/methods`.
- **`src/modules/cart/services/checkout.ts`** — calls `priceShipping` and `methodFitsWeight` to validate a chosen method and compute the delivery line total.
- **`src/modules/cart/services/items.ts`** / **`view.ts`** — read `SHIPPING_METHODS` (or the helpers) to display available methods and their costs in the cart view.
- **`src/modules/delivery/tests/unit/rates.test.ts`** / **`rates.property.test.ts`** — unit and property-based tests exercising every exported function and table invariant.
- **`src/modules/delivery/tests/integration/service.test.ts`** — integration test that hits `service.ts`, which in turn exercises this module's outputs.
- **`tests/cross-cutting/money-reconciliation.property.test.ts`** — property test asserting monetary consistency between cart totals (which include the shipping line produced by `priceShipping`) and the final order amount.
- **`src/modules/delivery/domain/index.ts`** — barrel that re-exports this module's symbols to the rest of the delivery domain.

## Notes

- `freeAbove` is optional per method; only `standard` sets it (`100`). `priceShipping` treats absence as "no free threshold."
- `maxInsuredValue` appears on `express` but is **not** checked by any function in this file—it's a service-layer validation concern.
- The table is intentionally flat (no zone matrix). The doc comment flags this as a deliberate simplification, not a bug.
- `pickup` has `price: 0` and no `maxWeight`; it exists to keep the "cheapest method" vs. "no eligible method" distinction testable.
