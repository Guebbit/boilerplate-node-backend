---
source: src/modules/orders/index.ts
sha256: c0c4831ad2a6f113560ea555e98c01e5f00cfe2baba74d1bc16241c21f9c45aa
generated_at: 2026-09-27T15:11:09.319672+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/index.ts

## Purpose

Public barrel for the Orders module. It is the **only** import surface that sibling modules are allowed to use (per `docs/theory/strategic-ddd.md` §5). It re-exports the module's services, domain, events, and emails, and re-exports model **types** (not runtime values), keeping `orderRepository` and model internals private to the module.

## Key elements

- **`export * from './services'`** — exposes all service-level functions (e.g. `placeOrder`, the single write path for new orders).
- **`export * from './domain'`** — exposes domain logic.
- **`export * from './events'`** — exposes order event definitions.
- **`export * from './emails'`** — exposes order-related email helpers.
- **`export type * from './model'`** — exposes model types only; the model's runtime (collections, `orderRepository`) stays internal.

## Relationships

- **`src/modules/orders/domain/index.ts`, `src/modules/orders/events.ts`, `src/modules/orders/emails.ts`, `src/modules/orders/model.ts`** — direct re-export targets; this barrel is their public entry point.
- **`src/modules/cart/services/checkout.ts`** — the cart checkout flow calls `placeOrder` (exposed via this barrel) rather than writing to the order collection directly.
- The doc comment notes that the module's dependency on `users` (`personalData.erase`, `userService.getById`) is handled by the module's internal `module.ts`, **not** surfaced through this barrel.

## Notes

- `export type *` (not `export *`) on `./model` is deliberate: importing modules get type-level access only; the runtime model and its repository are not part of the public API.
- Any sibling module that needs to create an order must go through `placeOrder`; direct collection access is prohibited.
- Do **not** add a re-export of `./module.ts` here — the comment explicitly scopes the `users` interaction to that file's own concern.
