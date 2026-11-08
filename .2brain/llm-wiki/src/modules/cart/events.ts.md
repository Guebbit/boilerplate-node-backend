---
source: src/modules/cart/events.ts
sha256: 753029a510fd5cc232d1a000447a6ded464caf42354c2c7ddd65b125a57f2971
generated_at: 2026-11-08T05:13:48.707071+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/events.ts

## Purpose

Declares the cart module's domain events (`cart.lines_removed`, `cart.merge_refused`) by augmenting the kernel's `DomainEventMap` via TypeScript declaration merging, and exports the event-name constants so emitters and listeners share a single spelling. This keeps the catalogue of app-wide events extensible per-module without editing the kernel's file.

## Key elements

- **`DomainEventMap` augmentation** (`declare module '@kernel/events'`): Adds two entries — `'cart.lines_removed'` and `'cart.merge_refused'` — with their typed payloads.
- **`CART_LINES_REMOVED`** (`'cart.lines_removed'`): Constant for the event fired after a product is pulled from users' carts. Payload carries `userIds`, `productId`, and locale-mapped `titles`.
- **`CART_MERGE_REFUSED`** (`'cart.merge_refused'`): Constant for the event fired when a `POST /cart/merge` could not add some guest lines because the product is unavailable. Payload carries `userId` and an array of refused lines (`productId`, `requested`, `titles`).

## Relationships

- **`services/cleanup.ts`** — Likely the emitter of `CART_LINES_REMOVED` after pulling a deleted product from carts.
- **`services/merge.ts`** — Likely the emitter of `CART_MERGE_REFUSED` when guest-cart lines cannot be added.
- **`index.ts`** — Module barrel; may re-export the constants for external consumers.
- **`tests/integration/merge.test.ts` / `merge-effects.test.ts` / `line-availability.test.ts`** — Assert that the correct events are (or are not) emitted under specific merge and availability scenarios.

## Notes

- Both events copy `titles` from the source product **at emit time** because the product may no longer exist for later listeners to look up.
- `cart.merge_refused` is emitted **zero or one** times per merge call (only when at least one line was fully refused); lines that landed with an adjusted quantity are deliberately excluded — that detail belongs in the HTTP response, not the event.
- `cart.lines_removed` is emitted **only when at least one cart held the product**, and the cart module (not `notifications`) owns it because only the cart knows *which users* were affected.
- The file contains **no runtime logic** beyond two `const` declarations; everything else is type-level augmentation.
