---
source: src/modules/delivery/domain/rates.ts
source_sha256: 5d3ed1e51ed6932d4c17f23ee6f94fc64ce5982be5de6f81b60633a71faa85d2
context_sha256: 0dc481fdec2e69d1e3288f228491612068138f382b090715e305448b667db04a
generated_at: 2026-11-22T04:48:57.818218+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/domain/rates.ts

## Purpose
Pure shipping-rate logic over a static table of shipping methods. It lives in `domain/` (like `evaluateCheckout`) so that every shipping quote comes from one place. `GET /delivery/methods` returns this table verbatim, so `ShippingMethod` comes from this module's `openapi.yaml` schema.

## Key elements
- `StaticShippingMethod` – `ShippingMethod` minus `currency`. Currency is live config (`NODE_DEFAULT_CURRENCY`), so it is not stored in the table.
- `SHIPPING_METHODS` – the flat-rate table:
  - `standard`: price 5.00, free at or above 100.00, max weight 30,000, requires an address.
  - `express`: price 15.00, tracked, max weight 5000, requires an address.
  - `pickup`: price 0.00, no address needed, no weight ceiling.
- `findShippingMethod(methodId)` – looks up a method by id and returns `undefined` if there is none. The caller decides what a missing method means.
- `priceShipping(method, itemsTotal, currency)` – the cost as decimal text. It is free once `itemsTotal` reaches `freeAbove`, and the flat rate otherwise. The internal `priceShippingMoney` does the comparison in minor units, so `"100"` and `"100.00"` are equal.
- `quoteMethod(method, currency)` – turns a table row into the wire `ShippingMethod`. It pads `price` and `freeAbove` to the currency's decimal places and adds `currency`.
- `methodFitsWeight(method, weight)` – checks a weight in grams against `minWeight` and `maxWeight`. A missing bound is open on that side, not zero.
- `cheapestStandardShipping(itemsTotal, currency)` – the cheapest price among methods with `requiresAddress: true`, returned as decimal text, or `0` if none qualify. It is the ceiling on what a withdrawal refunds of the shipping paid (Consumer Rights Directive Art. 13(2)).

## Relationships
- Imports `padDecimal`, `toDecimalString`, `toMinorUnits` and the `Money` type from `src/domain-primitives/money.ts`. All price arithmetic and comparison goes through these.
- Imports the `ShippingMethod` type from `src/types/index.ts`.
- The doc comments name `src/modules/delivery/services/process.ts`, whose `listMethods` adds `currency` to the static methods per call.
- Tests cover this file: `src/modules/delivery/tests/unit/rates.test.ts`, `src/modules/delivery/tests/unit/rates.property.test.ts`, `src/modules/delivery/tests/unit/money-reconciliation.property.test.ts`, and `src/modules/delivery/tests/integration/service.test.ts`.
- The other neighbors (`src/modules/delivery/domain/index.ts`, `src/modules/delivery/domain/tracking.ts`, the cart services, `src/modules/returns/services/receive.ts`) do not interact with this file in any way visible in its content.

## Notes
- Because `pickup` has `requiresAddress: false`, it is excluded from `cheapestStandardShipping`. Otherwise it would always win at zero.
- When standard shipping is free because the order is large, `cheapestStandardShipping` returns `0`. A paid express upgrade then stays entirely with the shop.
- `Math.min` drops the `Money` brand, so `cheapestStandardShipping` casts the result back to `Money`.
- The table is intentionally flat. A zone matrix is deliberately left out.
