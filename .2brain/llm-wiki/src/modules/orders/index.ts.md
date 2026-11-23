---
source: src/modules/orders/index.ts
source_sha256: 4c8143bd9dad551ce6f3456f82789c24cc470710c789a055dea616240cb33fa4
context_sha256: 3b26e53968c4f7841abe6f61629a0120b5cecb994d22761e8773474605f12895
generated_at: 2026-11-22T06:15:01.312981+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/index.ts

## Purpose
Public barrel for the Orders module. Per its doc comment, it is the only surface a sibling module may import. It re-exports the module's services, domain, events, emails and model types, and keeps `orderRepository` and the model's runtime internal.

## Key elements
- `export * from './services'`: service layer, including `orderService.placeOrder`. The doc comment names `placeOrder` as the one function that writes a new order.
- `export * from './domain'`: domain exports.
- `export * from './events'`: event exports.
- `export * from './emails'`: email exports.
- `export type * from './model'`: type-only re-export of the model. No model runtime is exposed.

## Relationships
- The doc comment says the `@modules/cart` checkout and this module's own `create` both call the one function that writes a new order, never the collection directly. `src/modules/cart/services/checkout.ts` is a neighbor consistent with that.
- Other neighbors (cart's `reorder`, `view`, `post-checkout` and the stock integration test, plus the `delivery` module's services, presenter and `module.ts`) are related through the dependency graph. They presumably import through this barrel, but the barrel's content doesn't show which symbols they use.
- This module's reach into `users` (an erase hook and a user lookup by id) is handled in the module's own `module.ts`, not in this barrel.

## Notes
- New orders must be written through the single order-writing service function (`placeOrder`). Don't use `orderRepository` or the collection directly.
- Sibling modules should import from this barrel, not from internal paths.
- The doc comment points to a "published language" section on the barrel in the project's strategic DDD docs for the rationale.
