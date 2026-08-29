# src/modules/delivery/domain/rates.ts

## Purpose

Single source of truth for the shop's shipping cost table and the two pure functions that resolve a method by id and price it against an order total. Lives in `domain/` (alongside `evaluateCheckout`, `sumLineItems`) so that quoted numbers originate from exactly one place, and so a project with negotiated carrier rates can swap the table or the whole module without touching checkout.

## Key elements

- **`SHIPPING_METHODS: readonly ShippingMethod[]`** — Static table of three methods: `standard` ($5, free above $100), `express` ($15), `pickup` ($0). The `pickup` entry exists to keep "cheapest valid method" distinguishable from "no method selected."
- **`findShippingMethod(methodId: string): ShippingMethod | undefined`** — Linear lookup by `id`. Returns `undefined` on miss; the caller decides how to handle absence.
- **`priceShipping(method: ShippingMethod, itemsTotal: number): number`** — Returns `0` when `method.freeAbove` is set and `itemsTotal >= freeAbove`; otherwise returns `method.price`. Pure, no side effects.

## Relationships

- **`src/types/index.ts`** — Source of the `ShippingMethod` type (declared once in the OpenAPI schema). This file imports it rather than re-declaring the shape.
- **`src/modules/delivery/domain/index.ts`** — Barrel for the `domain/` folder; re-exports this module's symbols so consumers can `import { priceShipping } from '…/domain'`.
- **`src/modules/delivery/service.ts`** — Consumes `findShippingMethod` / `priceShipping` when answering delivery-related requests.
- **`src/modules/cart/services/checkout.ts`** — The only production caller of `priceShipping`; never touches `SHIPPING_METHODS` directly.
- **`src/modules/delivery/tests/unit/rates.test.ts`** — Unit tests for the three exports.
- **`src/modules/delivery/tests/integration/service.test.ts`** — Exercises the delivery service, which in turn exercises these functions.

## Notes

- `ShippingMethod.freeAbove` is **optional**. `priceShipping` guards with `!== undefined` before comparing; omitting it means the method always costs its flat `price`.
- `findShippingMethod` intentionally returns `undefined` (not `null`, not a throw). Callers must handle the missing-method case explicitly.
- Rates are flat by design; there is no weight/zone logic. The doc comment states this is a deliberate scope choice, not an oversight.
- `SHIPPING_METHODS` is `readonly` — do not mutate entries in place.
