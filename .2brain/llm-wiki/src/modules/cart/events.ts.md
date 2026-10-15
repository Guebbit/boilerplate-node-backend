---
source: src/modules/cart/events.ts
sha256: 753029a510fd5cc232d1a000447a6ded464caf42354c2c7ddd65b125a57f2971
generated_at: 2026-10-15T10:23:25.609592+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/events.ts

## Purpose

Declares the cart module's domain event payloads by augmenting the kernel's `DomainEventMap` interface (via `declare module '@kernel/events'`), so the event catalogue grows per-module without editing a central file. Also exports the event-name string constants so emitters and listeners share a single spelling.

## Key elements

- **`'cart.lines_removed'`** (payload type in `DomainEventMap`) — Emitted once per product deletion after the product has been pulled from users' carts. Payload: `userIds`, `productId`, `titles` (locale→name, copied from `product.deleted` because the product no longer exists).
- **`'cart.merge_refused'`** (payload type in `DomainEventMap`) — Emitted when `POST /cart/merge` could not add some guest-cart lines at all (product not publicly visible / not for sale). Payload: `userId`, `lines[]` each with `productId`, `requested` quantity, and `titles`.
- **`CART_LINES_REMOVED`** — String constant `'cart.lines_removed'` exported for use as the event name.
- **`CART_MERGE_REFUSED`** — String constant `'cart.merge_refused'` exported for use as the event name.

## Relationships

- **`src/modules/cart/services/cleanup.ts`** — Expected emitter of `cart.lines_removed` (the cleanup path that removes a deleted product from carts).
- **`src/modules/cart/services/merge.ts`** — Expected emitter of `cart.merge_refused` (the merge path that records lines it could not add).
- **`src/modules/cart/index.ts`** — Module barrel; likely re-exports these constants so other modules can import the event names from the cart's public surface.
- **`src/modules/cart/tests/integration/line-availability.test.ts`** and **`src/modules/cart/tests/integration/merge-effects.test.ts`** — Integration tests that assert the emission (and payload shape) of these events.

## Notes

- This file is **types-only at runtime** except for the two `export const` name strings; it has no logic. The "declare module" block contributes no emitted JS.
- `titles` in both events is a deliberate snapshot of the product name at emission time, because the product may already be unqueryable by the time a listener reads the event.
- `cart.merge_refused` is only for lines that could **not** be added at all; lines that were added with a different (clamped) quantity are intentionally excluded and belong in the merge response instead.
