---
source: src/modules/delivery/domain/rates.ts
sha256: d632d784649a086abe1de26fa5b010fc8d8d52d1008ada4648402d2bdc0a005f
generated_at: 2026-11-08T05:29:28.672338+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/rates.ts

## Purpose

Pure-function rate table for shipping methods. Exists in the `domain/` layer (alongside `evaluateCheckout`) so that every quote, weight check, and refund ceiling derives from exactly one static source. The table is the single source of truth that `GET /delivery/methods` answers verbatim.

## Key elements

- **`StaticShippingMethod`** — `Omit<ShippingMethod, 'currency'>`. The table row without the live currency, which the service stamps per call.
- **`SHIPPING_METHODS`** — `readonly` array of three rows (`standard`, `express`, `pickup`). Each carries `price`, optional `freeAbove`, `tracked`, optional `minWeight`/`maxWeight`, and `requiresAddress`.
- **`findShippingMethod(id)`** — lookup by id; returns `undefined` and leaves the absence decision to the caller.
- **`priceShippingMoney`** *(private)* — computes cost in minor units, honouring the `freeAbove` threshold. All comparisons and additions happen in minor units.
- **`priceShipping(method, itemsTotal, currency)`** — public wrapper around `priceShippingMoney`, returning the result as a decimal string at the currency's scale.
- **`quoteMethod(method, currency)`** — shapes a table row for wire output: pads `price`/`freeAbove` to the currency's decimal places and stamps `currency`.
- **`methodFitsWeight(method, weight)`** — boolean check against optional `minWeight`/`maxWeight`; an absent bound is open on that side.
- **`cheapestStandardShipping(itemsTotal, currency)`** — minimum cost among methods where `requiresAddress` is `true` (i.e. actual delivery, not pickup). Used as the refund ceiling for shipping under Consumer Rights Directive Art. 13(2).

## Relationships

- **`@domain-primitives/money`** — imports `padDecimal`, `toDecimalString`, `toMinorUnits`, and the `Money` type; all arithmetic and formatting of money values delegates to this module.
- **`@types` (`ShippingMethod`)** — the wire-facing schema that `StaticShippingMethod` and `quoteMethod` are built against.
- **`src/modules/delivery/domain/index.ts`** — barrel re-export; consumers import from the domain entry point rather than this file directly.
- **`src/modules/delivery/services/process.ts`** — service layer that calls `findShippingMethod`, `priceShipping`, `methodFitsWeight`, and `quoteMethod` when processing a delivery order.
- **`src/modules/cart/services/checkout.ts`** — reads rates during checkout to compute the shipping charge and validate method/weight.
- **`src/modules/cart/services/items.ts`** — supplies the `itemsTotal` (lines total) that feeds `priceShipping` and `cheapestStandardShipping`.
- **`src/modules/returns/services/receive.ts`** — calls `cheapestStandardShipping` to cap how much of the paid shipping a withdrawal refunds.
- **`src/modules/delivery/domain/tracking.ts`** — sibling in the same domain folder; the `tracked` flag in this file's table is the contract that tracking services rely on to decide whether a tracking code applies.
- **Tests** — `rates.test.ts` (unit), `rates.property.test.ts` (property-based), `money-reconciliation.property.test.ts` (cross-checks minor-unit arithmetic), and `service.test.ts` (integration through the service layer).

## Notes

- **All money math is in minor units.** The table stores decimal strings (`"5.00"`), but every comparison and addition goes through `toMinorUnits`. This guarantees `"100"` ≡ `"100.00"` regardless of how a caller formats the input.
- **`currency` is never in the table.** It is live deployment config (`NODE_DEFAULT_CURRENCY`) stamped per call by the service (`listMethods` → `quoteMethod`). Adding it to the static rows would freeze it at import time.
- **`pickup` is intentionally free and unbounded.** It has no `maxWeight` (counter collection has no weight limit) and `requiresAddress: false`. Any logic that picks a "cheapest method" must account for this; `cheapestStandardShipping` handles it by filtering on `requiresAddress`.
- **`freeAbove` is optional.** Only `standard` sets it. A method without the field simply never qualifies for free shipping.
- **`minWeight` is absent from all current rows** but the type and `methodFitsWeight` support it; treat absent as an open lower bound, not zero.
- **Flat rates by design.** The JSDoc notes a zone matrix is a real-project concern with "no demo value" here; do not expect tiered or weight-scaled pricing in the table.
