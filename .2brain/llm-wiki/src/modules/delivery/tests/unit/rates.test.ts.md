---
source: src/modules/delivery/tests/unit/rates.test.ts
sha256: ad29cf7f0ca1803f5dad7813ec83bb074d4ec3153bd18d0e02b727177c8f206c
generated_at: 2026-09-27T14:52:06.408609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/rates.test.ts

## Purpose

Unit tests for the pure-function pricing and weight logic in the delivery domain. The file header explicitly separates these from the integration-level `service.test.ts` (which requires a database): here there are no mocks, no DB — only assertions over a static table and three small functions.

## Key elements

- **`describe('findShippingMethod')`** — verifies lookup by id returns the expected object and that an unknown id yields `undefined`.
- **`describe('priceShipping')`** — covers four pricing scenarios: flat rate below the free-shipping threshold, zero at/above the threshold, flat rate when a method has no threshold (express), and zero for pickup.
- **`describe('methodFitsWeight')`** — covers the "no range" passthrough (pickup), the `maxWeight` boundary (express at 5000 vs 5001), and the `minWeight` boundary (tested with an inline synthetic object because no shipped method declares one).
- **`describe('SHIPPING_METHODS')`** — data-shape canaries on the committed table: every price ≥ 0, `tracked` and `requiresAddress` are genuine booleans (not `undefined`), and the per-method address requirement matches the expected set (standard/express → true, pickup → false).

## Relationships

- **`src/modules/delivery/domain/rates.ts`** — sole dependency. Imports `findShippingMethod`, `priceShipping`, `methodFitsWeight`, and `SHIPPING_METHODS`. All assertions here are against that module's public API; no other module is referenced.

## Notes

- The `minWeight` test deliberately constructs a method object inline (`{ id: 'heavy', …, minWeight: 1000 }`) rather than reading from `SHIPPING_METHODS`, so the rule stays covered even though no current method declares a minimum.
- The boolean-type checks (`typeof … toBe('boolean')`) are a guard against a silently missing flag surfacing as `undefined` in downstream consumers (shipping-code gate, checkout address rule) instead of a clean refusal.
- The `SHIPPING_METHODS` price/flag tests act as canaries for typos in the committed data table — a wrong number would otherwise only appear at checkout.
