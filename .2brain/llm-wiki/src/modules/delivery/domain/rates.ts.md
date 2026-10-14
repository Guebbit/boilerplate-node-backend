---
source: src/modules/delivery/domain/rates.ts
sha256: d46d07b5a9a9726cbd42ce4fec8dcd76616f2a9f743eb7cc57006e60601fa11d
generated_at: 2026-10-14T15:23:22.011284+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/rates.ts

## Purpose

Defines the static shipping-rate table and the pure functions that price, validate, and select methods. Lives in the `domain/` layer (like `evaluateCheckout`) so that every quote in the system is computed from exactly one source, and so the logic is testable without touching services or I/O.

## Key elements

- **`StaticShippingMethod`** — `Omit<ShippingMethod, 'currency'>`; the shape of a row in the rate table. `currency` is excluded because it is runtime config (`NODE_DEFAULT_CURRENCY`) stamped on per call by the service layer.
- **`SHIPPING_METHODS`** — `readonly StaticShippingMethod[]` with three entries: `standard` (free above 100, 30 kg cap), `express` (tracked, 5 kg cap), `pickup` (free, no address, no weight cap).
- **`findShippingMethod(methodId)`** — linear lookup; returns `StaticShippingMethod | undefined`. Caller decides how to handle absence.
- **`priceShipping(method, itemsTotal)`** — returns `0` when `freeAbove` is met, otherwise the flat `price`.
- **`methodFitsWeight(method, weight)`** — boolean weight-range check. A missing `minWeight`/`maxWeight` means that side is open (not zero).
- **`cheapestStandardShipping(itemsTotal)`** — cheapest price among address-requiring methods only; used as the refund ceiling for shipping under Consumer Rights Directive Art. 13(2).

## Relationships

- **`src/types/index.ts`** — source of the `ShippingMethod` type that `StaticShippingMethod` narrows.
- **`src/modules/delivery/domain/index.ts`** — barrel that re-exports this module's public surface to the rest of the delivery domain.
- **`src/modules/delivery/services/start.ts`** / **`ship.ts`** — service layer that consumes `findShippingMethod`, `priceShipping`, `methodFitsWeight` to validate and quote an order.
- **`src/modules/cart/services/checkout.ts`** — supplies `itemsTotal` (from cart items) into the pricing functions.
- **`src/modules/returns/services/receive.ts`** — calls `cheapestStandardShipping` to cap the shipping portion of a refund.
- **`src/modules/delivery/tests/unit/rates.test.ts`**, **`rates.property.test.ts`** — unit and property-based tests exercising every exported function.
- **`tests/cross-cutting/money-reconciliation.property.test.ts`** — property test that cross-checks shipping totals against cart totals.

## Notes

- `pickup` deliberately omits `maxWeight`: a counter collection has no weight limit. `methodFitsWeight` treats a missing bound as open, so `pickup` accepts any weight.
- `cheapestStandardShipping` filters on `requiresAddress === true` specifically to exclude `pickup` (price 0), which would otherwise always be the "cheapest delivery."
- `freeAbove` is optional; only `standard` uses it. `express` and `pickup` never become free via threshold.
- The table is intentionally flat-rate with no zone matrix. Adding zones would require restructuring `SHIPPING_METHODS` and the pricing functions together.
- `minWeight` is referenced in `methodFitsWeight` but not set by any current method; it exists for forward-compatibility with a future carrier minimum.
