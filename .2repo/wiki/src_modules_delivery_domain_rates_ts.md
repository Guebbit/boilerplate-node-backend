# src/modules/delivery/domain/rates.ts

## Purpose

Static shipping-rate table and two pure pricing helpers for the delivery domain. All shipping-cost logic lives here so that both the cart checkout flow and the delivery service derive quotes from a single source.

## Key elements

- **`SHIPPING_METHODS`** – `readonly ShippingMethod[]` with three fixed entries: `standard` ($5, free above $100), `express` ($15), `pickup` ($0). The deliberate flat rates avoid weight/zone complexity.
- **`findShippingMethod(methodId: string)`** – Linear lookup by `id`; returns the matching `ShippingMethod` or `undefined`. The caller decides how to interpret absence.
- **`priceShipping(method, itemsTotal)`** – Returns `0` when `itemsTotal >= method.freeAbove`, otherwise `method.price`. Methods without a `freeAbove` field always return their flat price.

## Relationships

- **`src/types/index.ts`** – Supplies the `ShippingMethod` type (imported as `@types`). This module is the canonical "schema" that type describes.
- **`src/modules/delivery/domain/index.ts`** – Barrel file that re-exports this module so consumers can `import from '../domain'` without naming the file.
- **`src/modules/delivery/service.ts`** – Calls `findShippingMethod` to validate a requested method id before returning it to the API layer.
- **`src/modules/cart/services/checkout.ts`** – Consumes `SHIPPING_METHODS` / `priceShipping` to compute the delivery line-item during checkout.
- **`src/modules/delivery/tests/unit/rates.test.ts`** – Direct unit tests for `findShippingMethod` and `priceShipping`.
- **`src/modules/delivery/tests/integration/service.test.ts`** – Exercises the service (and therefore this module) through the public API surface.

## Notes

- `pickup` exists specifically to keep "cheapest method" ($0) distinguishable from "no method returned" (`undefined` from `findShippingMethod`). Don't remove it when simplifying.
- `freeAbove` is optional on `ShippingMethod`; `priceShipping` guards with `!== undefined` before comparing. Any new method without the field is always charged its flat `price`.
- The module is intentionally in `domain/` (not `services/`) because it contains no I/O or framework dependencies—same reasoning as `evaluateCheckout` in the cart domain (see `docs/theory/domain-layer.md`).
