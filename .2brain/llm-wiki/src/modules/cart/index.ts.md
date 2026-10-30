---
source: src/modules/cart/index.ts
sha256: 86d0c0ac8641b26ed35ef0d1bf5472300b858ade3e0b7b2fa1cfb7b0815cc287
generated_at: 2026-10-29T03:22:04.323228+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/index.ts

## Purpose

Public barrel for the cart module. It is the **only** import surface available to sibling modules (enforced per `docs/theory/strategic-ddd.md` §5). Internals such as `cartRepository` and the model's runtime values are deliberately kept private so siblings cannot bypass the service layer's rules.

## Key elements

- `export * from './services'` — re-exports all runtime values (services, functions) from the cart service layer.
- `export * from './events'` — re-exports event definitions/creators from `events.ts`.
- `export * from './domain'` — re-exports domain logic from `domain/index.ts`.
- `export type * from './model'` — re-exports **type-only** symbols (interfaces, type aliases) from `model.ts`; no runtime values leak.
- `export type * from './presenter'` — re-exports **type-only** symbols from `presenter.ts`; no runtime values leak.

## Relationships

- **Re-exports** `src/modules/cart/services/index.ts`, `src/modules/cart/events.ts`, `src/modules/cart/domain/index.ts`, `src/modules/cart/model.ts` (types), and `src/modules/cart/presenter.ts` (types). This file is the sole aggregation point for those.
- **Consumed by** sibling modules and integration tests (`src/modules/addresses/tests/integration/checkout.test.ts`, `src/modules/notifications/tests/integration/events.test.ts`, `src/modules/wishlist/service.ts`, `src/modules/wishlist/tests/integration/service.test.ts`, `tests/integration/order-snapshot-locale.test.ts`). These import cart services, events, or types exclusively through this barrel rather than reaching into sub-paths.

## Notes

- The `export type *` (type-only) syntax for `model` and `presenter` is intentional: it prevents accidental runtime imports of internal model state or presenter logic. If a sibling needs a cart value at runtime, it must go through `services` or `domain`.
- Adding a new public sub-module to cart requires a corresponding `export` line here; there is no other legitimate entry point.
- `cartRepository` is intentionally **not** re-exported. Do not add it to this barrel.
