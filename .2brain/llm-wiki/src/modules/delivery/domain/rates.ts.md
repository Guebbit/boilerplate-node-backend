---
source: src/modules/delivery/domain/rates.ts
sha256: 0c5ec96a72aff38e753def1e2827b8b64d047fc745f8da7c443c3867eafacfdd
generated_at: 2026-10-29T03:33:56.729088+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/rates.ts

## Purpose

Pure, stateless shipping-rate logic and the static method table that defines what the shop offers. Kept in `domain/` (alongside `evaluateCheckout`) so every part of the system derives a shipping quote from exactly one source. `GET /delivery/methods` serves this table verbatim.

## Key elements

- **`StaticShippingMethod`** — `Omit<ShippingMethod, 'currency'>`. The currency field is live deployment config (`NODE_DEFAULT_CURRENCY`) stamped at call time by the service layer, never baked into the import-time table.
- **`SHIPPING_METHODS`** — `readonly` array of three methods: `standard` (free ≥ 100, 30 kg cap), `express` (tracked, 5 kg cap), `pickup` (free, no address, no weight cap).
- **`findShippingMethod(methodId)`** — lookup by id; returns `undefined` on miss so the caller decides the error path.
- **`priceShipping(method, itemsTotal)`** — returns `0` when `freeAbove` is met, otherwise the flat `price`.
- **`methodFitsWeight(method, weight)`** — true when weight falls within `minWeight`/`maxWeight`; an absent bound is open (not zero).
- **`cheapestStandardShipping(itemsTotal)`** — minimum price among methods with `requiresAddress: true`. Excludes `pickup` because it is collection, not delivery. Used to cap the shipping refund under Consumer Rights Directive Art. 13(2).

## Relationships

- **`src/types/index.ts`** — imports the `ShippingMethod` interface; `StaticShippingMethod` is a structural subset of it.
- **`src/modules/delivery/domain/index.ts`** — barrel re-exports this module's public API to the rest of the delivery module.
- **`src/modules/delivery/services/process.ts`** — the service layer that stamps `currency` onto methods for the public API and orchestrates delivery workflow using `findShippingMethod`, `priceShipping`, and `methodFitsWeight`.
- **`src/modules/returns/services/receive.ts`** — calls `cheapestStandardShipping` to compute the maximum refundable shipping amount.
- **`src/modules/cart/services/checkout.ts` / `items.ts` / `view.ts`** — consume the rate table and pricing functions to present and validate shipping options during cart operations.
- **Tests** — `rates.test.ts` (unit), `rates.property.test.ts` (property-based invariants on weight/price boundaries), `service.test.ts` (integration through the service layer), and `money-reconciliation.property.test.ts` (cross-module monetary consistency).

## Notes

- The table is intentionally flat-rate with no zone matrix; adding zones would change the shape of `StaticShippingMethod`.
- `pickup` has no `maxWeight` (open bound) — this is deliberate, not an omission. Any weight passes `methodFitsWeight` for it.
- `cheapestStandardShipping` filters on `requiresAddress: true` specifically to exclude pickup; a naïve "cheapest of all methods" would always return 0 and break refund logic.
- `minWeight` is not set on any current method but is supported by the type and `methodFitsWeight`; adding it requires no code change.
