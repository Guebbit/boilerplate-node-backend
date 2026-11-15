---
source: src/modules/delivery/domain/rates.ts
sha256: c9d6e12352572473000eb6dc99193f639ffec2352633ab73e03edf6492c1cc98
generated_at: 2026-11-14T19:40:17.757803+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/rates.ts

## Purpose

Pure-function module that defines the shop's static shipping-rate table and all price/eligibility queries over it. It exists so that shipping quotes, weight checks, and the refund ceiling for shipping are computed in exactly one place, with all money arithmetic in minor units. It lives in `domain/` (not `services/`) because it has no I/O — just a table and math over it.

## Key elements

- **`StaticShippingMethod`** — `ShippingMethod` minus `currency`; the shape of a row as stored in the table.
- **`SHIPPING_METHODS`** — `readonly` array of three rows (`standard`, `express`, `pickup`). Flat rates; `pickup` has no `maxWeight` and no `requiresAddress`.
- **`findShippingMethod(id)`** — returns the matching row or `undefined`.
- **`priceShippingMoney(method, itemsTotal, currency)`** — *internal*; returns a `Money` (minor-unit) value, applying `freeAbove` threshold.
- **`priceShipping(method, itemsTotal, currency)`** — public wrapper returning the cost as a decimal string at the currency's places.
- **`quoteMethod(method, currency)`** — pads `price`/`freeAbove` to the live currency's decimal places and stamps `currency`, producing a wire-ready `ShippingMethod`.
- **`methodFitsWeight(method, weight)`** — checks a basket weight (grams) against the method's optional `minWeight`/`maxWeight`; absent bounds are open.
- **`cheapestStandardShipping(itemsTotal, currency)`** — minimum delivery cost across methods where `requiresAddress` is true (i.e., excludes `pickup`); returns `"0.00"` if nothing delivers. Used as the refund ceiling per Art. 13(2) Consumer Rights Directive.

## Relationships

- **`src/domain-primitives/money.ts`** — imports `padDecimal`, `toDecimalString`, `toMinorUnits`, and the `Money` brand type; all money comparison and formatting flows through these primitives.
- **`src/types/index.ts`** — imports the `ShippingMethod` wire type (the public API schema).
- **`src/modules/delivery/domain/index.ts`** — barrel file re-exporting this module's public surface.
- **`src/modules/returns/services/receive.ts`** — consumes `cheapestStandardShipping` to cap the refundable shipping portion of a withdrawal.
- **`src/modules/cart/services/checkout.ts`** — calls `priceShipping` / `quoteMethod` during checkout to attach a shipping charge to the order.
- **`src/modules/delivery/services/process.ts`** — uses `findShippingMethod` and `methodFitsWeight` when confirming a delivery.
- **`src/modules/delivery/tests/unit/rates.test.ts`** / **`rates.property.test.ts`** — unit and property-based tests for the pricing and weight functions.
- **`src/modules/delivery/tests/unit/money-reconciliation.property.test.ts`** — property tests verifying minor-unit round-trips through `priceShipping` ↔ `priceShippingMoney`.
- **`src/modules/delivery/tests/integration/service.test.ts`** — end-to-end test exercising the delivery service that depends on this module.

## Notes

- All comparisons and additions are done in **minor units** (`toMinorUnits`); the table stores decimal text. `"100"` and `"100.00"` are equivalent after conversion.
- `cheapestStandardShipping` deliberately **filters out `pickup`** (`requiresAddress: false`). Without that filter, the zero-cost pickup would always win and the refund ceiling would be meaningless.
- `Math.min(...prices)` is cast `as Money` because `Math.min` strips the nominal brand from the `Money` type.
- `pickup` has no `maxWeight` key at all (not `undefined` vs `0`), so `methodFitsWeight` treats it as an open upper bound — any weight is acceptable.
- The module doc-block notes it mirrors the `openapi.yaml` schema for `GET /delivery/methods`; `quoteMethod` is the function that turns a static row into that wire shape.
