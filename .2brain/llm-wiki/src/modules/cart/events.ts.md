---
source: src/modules/cart/events.ts
sha256: 0108978da0e18ec43706f1cd1b683f75a41d557fb0dec1f910c85a1a2d6f0608
generated_at: 2026-11-14T19:28:44.496363+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/events.ts

## Purpose

Declares the cart module's domain events by augmenting the kernel's `DomainEventMap` interface (in `@kernel/events`), and exports the event-name constants so emitters and listeners share a single spelling. This keeps the catalogue of events composable—each module adds its own payloads without editing a central file.

## Key elements

- **`declare module '@kernel/events'`** — extends `DomainEventMap` with two cart-owned payloads:
  - `'cart.lines_removed'` — emitted once per product deletion, after the product has been pulled from carts, only when at least one cart held it. Carries `userIds`, `productId`, and `titles` (product name by locale, copied at emit time because the product is gone).
  - `'cart.merge_refused'` — emitted once per `POST /cart/merge` call that had at least one line it could not add (product no longer publicly visible, or cart at max-lines and product is new). Carries `userId` and an array of `lines` with `productId`, `requested` quantity, and `titles`.
- **`CART_LINES_REMOVED`** — string constant `'cart.lines_removed'`, exported as the canonical event name.
- **`CART_MERGE_REFUSED`** — string constant `'cart.merge_refused'`, exported as the canonical event name.

## Relationships

- **`src/modules/cart/services/cleanup.ts`** — the service that pulls a deleted product from user carts; the likely emitter of `CART_LINES_REMOVED`.
- **`src/modules/cart/services/merge.ts`** — implements `POST /cart/merge`; the likely emitter of `CART_MERGE_REFUSED` when some guest-cart lines cannot be added.
- **`src/modules/cart/index.ts`** — module entry point; expected to re-export or reference these event constants so other modules can import them through the barrel.
- **`src/modules/cart/tests/integration/merge.test.ts` / `merge-effects.test.ts`** — exercise the merge path whose failures produce `CART_MERGE_REFUSED`.
- **`src/modules/cart/tests/integration/line-availability.test.ts` / `line-cap.test.ts`** — exercise line-availability and capacity rules that determine whether a merge line is refused or added.

## Notes

- This file is **type-level + constants only**—no runtime logic. It contains no function bodies or side effects beyond the two `const` declarations.
- `titles` is deliberately denormalised into the event payload at emit time because the product record may no longer exist by the time a listener reads the event.
- `cart.merge_refused` is intentionally *not* emitted for lines that were merely added with a corrected quantity; that outcome is conveyed through the HTTP response, not an event.
