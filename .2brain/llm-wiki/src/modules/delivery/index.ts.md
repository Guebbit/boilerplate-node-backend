---
source: src/modules/delivery/index.ts
sha256: c881d5531e82765235dce76d77e97b8b32c94443a14f21aa68240981dd8a3975
generated_at: 2026-11-08T05:30:29.917354+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/index.ts

## Purpose

Public barrel for the delivery module. It is the **only** import surface that sibling modules (cart, returns, tests) may use, enforcing the strategic-DDD boundary rule. It re-exports domain pricing logic, events, email helpers, service functions, and type definitions, while keeping repositories and runtime model internals private.

## Key elements

- **`export * from './services'`** — value exports for delivery service functions (e.g. `findShippingMethod`, `priceShipping`, `shippedQuantities`, `cancelRemainder`).
- **`export * from './domain'`** — domain rules and pricing logic that cart's checkout depends on for consistent totals.
- **`export * from './events'`** — delivery domain events.
- **`export * from './emails'`** — delivery-related email helpers/templates.
- **`export type * from './model'`** — type-only exports of the delivery model (no runtime values leak out).

## Relationships

- **`src/modules/cart/services/checkout.ts`** — calls `findShippingMethod` / `priceShipping` through this barrel so the frozen order total and the `/methods` quote stay in lockstep.
- **`src/modules/cart/services/items.ts`**, **`src/modules/cart/services/view.ts`** — consume delivery types/services via this barrel.
- **`src/modules/returns/services/cancel-remainder.ts`** — reads `shippedQuantities` and invokes `cancelRemainder` to cancel unshipped line items.
- **`src/modules/returns/services/create.ts`**, **`options.ts`**, **`receive.ts`**, **`withdraw.ts`** — import delivery domain/service symbols through this barrel.
- **`src/modules/account/tests/contract/shop.contract.test.ts`**, **`src/modules/returns/tests/contract/api.contract.test.ts`** — contract tests that exercise the delivery surface exposed here.
- Internal sources (`./services`, `./domain`, `./events`, `./emails`, `./model`) are the sole origin of every re-export.

## Notes

- The `export type * from './model'` (type-only) is deliberate: no runtime model code or write handle on a collection escapes this file. Only the five `export *` / `export type *` lines exist; nothing else is re-exported.
- Sibling modules must import from this barrel, **not** from the sub-paths directly. This is the architectural invariant called out in `docs/theory/strategic-ddd.md` §5.
- See `docs/modules/delivery.md` for the broader module-level documentation.
