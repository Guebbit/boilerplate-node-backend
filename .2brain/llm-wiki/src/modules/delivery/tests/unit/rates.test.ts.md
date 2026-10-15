---
source: src/modules/delivery/tests/unit/rates.test.ts
sha256: b144d4ea6988b2eae2d744428cb7aedb25cbd68ca8b12e82f1824c8a5b999751
generated_at: 2026-10-15T10:29:18.282429+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/rates.test.ts

## Purpose

Unit tests for the pure shipping-rate domain functions in `../../domain/rates`. They verify the static `SHIPPING_METHODS` table and the three pricing/lookup helpers without any database or mocking, since the pricing rule is deterministic over committed data. The file's header explicitly contrasts this with `tests/integration/service.test.ts`, which exists because shipment *persistence* needs a real DB.

## Key elements

- **`describe('SHIPPING_METHODS')` (currency block)** — Iterates JPY, EUR, KWD and asserts every `price` and `freeAbove` value in the table passes `fitsCurrency`, catching rates that would round at charge time.
- **`describe('SHIPPING_METHODS')` (invariant block)** — Guards committed data: non-negative prices, `tracked`/`requiresAddress` are real booleans (not `undefined`), and address is required for every method except `pickup`.
- **`describe('findShippingMethod')`** — Confirms exact-object lookup by id and `undefined` for an id the shop does not offer.
- **`describe('priceShipping')`** — Covers flat-rate-below-threshold, free-at/above-threshold, no-threshold (express), and pickup-at-zero as distinct from "no method".
- **`describe('methodFitsWeight')`** — Boundary tests for `maxWeight` (5000 passes, 5001 fails), absence of a range (pickup always fits), and `minWeight` (tested via an inline object, since no shipped method declares one).

## Relationships

- **`src/modules/delivery/domain/rates.ts`** — The module under test. Imports `findShippingMethod`, `priceShipping`, `methodFitsWeight`, and the `SHIPPING_METHODS` table.
- **`src/shared-kernel/money.ts`** — Supplies `fitsCurrency`, used to assert that every rate/threshold is expressible in the currency's minor units.

## Notes

- Two separate `describe('SHIPPING_METHODS')` blocks exist (currency fit vs. structural invariants). Both target the same export but serve different guard purposes; they are not accidentally duplicated.
- The `minWeight` test deliberately builds an inline object (`{ id: 'heavy', …, minWeight: 1000 }`) rather than reading from `SHIPPING_METHODS`, so the boundary rule stays covered even though no current method declares a minimum.
- The `tracked` and `requiresAddress` boolean checks are canaries for downstream consumers (the shipping-code gate and checkout address rule) that would silently misbehave if the flag were `undefined`.
