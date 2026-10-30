---
source: src/modules/delivery/tests/unit/rates.test.ts
sha256: 07f02a306bfceec57a083e8ce4f36cf9e248211722f69d85cff760ca6d8a06dd
generated_at: 2026-10-29T03:50:04.531702+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/rates.test.ts

## Purpose

Unit tests for the shipping-rates domain module. Every case exercises pure functions over the committed `SHIPPING_METHODS` table — no mocks, no database. The file exists separately from the integration test (`tests/integration/service.test.ts`) because the pricing rules themselves have no I/O dependency and can be verified in isolation.

## Key elements

- **`describe('SHIPPING_METHODS')` (currency)** — Iterates JPY, EUR, KWD and asserts every `price` and `freeAbove` value fits within that currency's minor unit via `fitsCurrency`, catching rates that would round at charge time.
- **`describe('findShippingMethod')`** — Confirms lookup by id returns the expected object and returns `undefined` for an unoffered id.
- **`describe('priceShipping')`** — Verifies flat-rate charging below threshold, zero at/above threshold, flat rate when no threshold exists, and that pickup always prices at 0 (distinct from "no method found").
- **`describe('methodFitsWeight')`** — Covers open-range (pickup), `maxWeight` boundary (express 5000/5001), and `minWeight` boundary using an inline object (no shipped method declares `minWeight` today).
- **`describe('SHIPPING_METHODS')` (table invariants)** — Canaries: all prices ≥ 0, `tracked` and `requiresAddress` are real booleans (not `undefined`), and address is required for standard/express but not pickup.
- **`describe('cheapestStandardShipping')`** — Confirms it returns the standard flat rate for small orders, 0 above the free threshold, and excludes pickup ("collection, not delivery").

## Relationships

- **`src/modules/delivery/domain/rates.ts`** — The module under test. Provides `SHIPPING_METHODS`, `findShippingMethod`, `priceShipping`, `methodFitsWeight`, and `cheapestStandardShipping`.
- **`src/domain-primitives/money.ts`** — Provides `fitsCurrency`, used to validate that table values are representable in the minor units of a given currency.

## Notes

- The `minWeight` boundary test constructs its method object inline rather than reading from `SHIPPING_METHODS`, because no shipped method currently declares a `minWeight`; the test intentionally stays green even if that changes.
- The boolean-flag canary tests (`typeof … === 'boolean'`) exist to catch a missing property that would surface downstream as `undefined` in the shipping-door or checkout logic, not as a clean refusal.
- `cheapestStandardShipping` deliberately returns the standard rate, not pickup's 0, because pickup is a collection point, not a delivery service.
