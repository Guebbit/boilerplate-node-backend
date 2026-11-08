---
source: src/modules/cart/index.ts
sha256: 86d0c0ac8641b26ed35ef0d1bf5472300b858ade3e0b7b2fa1cfb7b0815cc287
generated_at: 2026-11-08T05:14:06.857241+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/index.ts

## Purpose

Public barrel (re-export) for the cart module. It is the **only** import surface allowed to sibling modules, per the strategic-DDD rule in `docs/theory/strategic-ddd.md` §5. It exposes service APIs, events, and domain logic by value, while the model and presenter are exposed as **types only**, keeping their runtime implementations (and the `cartRepository`) internal so siblings cannot bypass the service's rules.

## Key elements

- `export * from './services'` — re-exports the full public service API (values + types).
- `export * from './events'` — re-exports cart event definitions and helpers.
- `export * from './domain'` — re-exports domain-level logic (values + types).
- `export type * from './model'` — re-exports **type declarations only**; no runtime values leak out.
- `export type * from './presenter'` — re-exports **type declarations only**; no runtime values leak out.

## Relationships

- **Re-exports (direct dependencies):** `src/modules/cart/services/index.ts`, `src/modules/cart/events.ts`, `src/modules/cart/domain/index.ts`, `src/modules/cart/model.ts`, `src/modules/cart/presenter.ts`.
- **Consumers (sibling modules / tests that import through this barrel):** `src/modules/shop-tasks/module.ts`, `src/modules/shop-tasks/tests/integration/notices.test.ts`, `src/modules/wishlist/service.ts`, `src/modules/wishlist/tests/integration/service.test.ts`, `src/modules/addresses/tests/integration/checkout.test.ts`, `tests/integration/order-snapshot-locale.test.ts`.

## Notes

- The distinction between `export *` and `export type *` is intentional and load-bearing: adding a value export from `model` or `presenter` here would break the encapsulation contract. If a sibling needs a new cart capability, it must go through the service layer in `./services`.
- Do not add direct imports of `./model` or `./presenter` runtime values to other modules; the barrel is the gate.
