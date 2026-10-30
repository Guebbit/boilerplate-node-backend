---
source: src/modules/orders/index.ts
sha256: a3fb755f29bdbf49317ff6fa00f9622a3cb24d81d5118617c61cdf2d0e1af917
generated_at: 2026-10-29T04:42:33.980744+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/index.ts

## Purpose

Public barrel (the sole import surface) for the Orders module. Sibling modules (Cart, Delivery) import only from here, per the strategic-DDD rule in `docs/theory/strategic-ddd.md` §5. It re-exports the module's services, domain, events, and emails by value, and the model by type only.

## Key elements

- `export * from './services'` — value exports (e.g. `orderService.placeOrder`, the single write path for creating orders).
- `export * from './domain'` — value exports (domain entities / value objects).
- `export * from './events'` — value exports (domain events the module publishes).
- `export * from './emails'` — value exports (email templates / senders).
- `export type * from './model'` — **type-only** re-export; the model's runtime implementation is intentionally kept internal.

## Relationships

- **Cart → Orders:** `cart/services/checkout.ts` and `cart/services/reorder.ts` call `orderService.placeOrder` (exposed through this barrel) to persist a new order. They never touch the repository directly. `cart/controllers/post-checkout.ts` and `cart/services/view.ts` consume order state after checkout.
- **Delivery → Orders:** `delivery/services/*` (cut, deliver, cancel-remainder, board, announce, act, actions) import order data from this barrel to read and mutate order state during fulfilment. `delivery/presenter.ts` and `delivery/module.ts` wire the delivery side against orders.
- **Orders → Users:** The `personalData.erase` hook and `userService.getById` calls live in `module.ts`, *not* in this barrel. Sibling modules do not see them here.

## Notes

- `./model` is exported with `export type *` only — importing a value from `@modules/orders` will **not** give you the model's runtime; that is deliberately hidden.
- `orderService.placeOrder` is the *only* function that writes a new order row. Both Cart's checkout and Orders' own `create` go through it; the repository is never imported by a sibling.
- The barrel is the contract. If you need to add a cross-module entry point, it must appear here; internal wiring (e.g. the `users` dependency) stays in `module.ts`.
